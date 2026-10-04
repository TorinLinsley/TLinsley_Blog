"""
🧰 「工具」页后端：管理博客项目里 `<博客>/tools/` 下那些**独立的小网页工具**。

目录约定（和用户商量好的）：

    <博客根>/
      tools/
        tools.json            ← 工具清单（本模块读写；前台 /tools 页按请求实时读它）
        time_calc/            ← 一个工具一个文件夹（文件夹名 = URL 里 /tools/ 后面那一段）
          TimeCalculator_1.2.0.html
        random_generator/
          RandomGenerator.html
        .trash/               ← 删掉的工具先挪这儿（可手动找回）
      public/uploads/ico/     ← 本地图标文件（选图标那里"本地"标签读的就是它）

设计要点：
  · **只有一份数据**：工具文件、icons、清单都只放在博客项目里，控制台这边不复制一份，
    避免同样的东西存两遍（用户明确要求省存储）。
  · 前台 `/tools` 读 tools.json 是 force-dynamic，控制台一改、前台刷新就生效，**不用重建**。
  · 图标上传后立刻可用（存到 public/uploads/ico，前后台都走同一个 URL）。
  · 网页工具本身是独立 HTML，Next 不参与渲染，只按原样吐文件（见前台 app/tools/[...file]/route.ts）。
"""

import json
import os
import re
import shutil
import secrets
from datetime import datetime
from fastapi import APIRouter, Request, UploadFile, File
import httpx

router = APIRouter()

CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))
DEPLOY_CONFIG = os.path.join(PROJECT_ROOT, "data", "deploy_config.json")

# ---------------------------------------------------------------- 命名规则
# 工具目录名 = 地址栏 /tools/<这一段>/… ，所以只允许最干净的 ASCII：字母数字开头，后面可跟 . _ -
DIR_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")

# 浏览器地址栏 / Windows / Linux 都不能用的字符（给前端做即时提示用，后端也照这个挡）
ILLEGAL_CHARS = "\\/:*?\"<>|#%&{}$!+'`=@~^[];,\t\n\r"
# Windows 保留名（就算大小写不一样、带扩展名也不能用）
RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}

# 浏览目录时永远跳过这些（太大 / 没意义）
SKIP_DIRS = {"node_modules", ".next", ".git", ".idea", ".vscode", "dist", "build", "__pycache__", ".trash"}

ICON_EXTS = {".svg", ".ico", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp"}

# 工具页导航栏主题的 6 个预设（见 app/tools/ToolsAdmin.tsx 里的选项）
NAV_THEMES = {"auto", "dark-trans", "dark-solid", "light-trans", "light-solid", "hidden"}


# ---------------------------------------------------------------- 基础工具
def get_blog_path() -> str:
    """博客项目物理路径（和同步/图床用的是同一个配置：data/deploy_config.json 的 blogPath）"""
    try:
        with open(DEPLOY_CONFIG, "r", encoding="utf-8") as f:
            return (json.load(f).get("blogPath") or "").strip()
    except Exception:
        return ""


def blog_root() -> str:
    p = get_blog_path()
    return p if p and os.path.isdir(p) else ""


def tools_root(create: bool = False):
    """<博客>/tools；create=True 时不存在就建。返回 None 表示博客路径没配好。"""
    root = blog_root()
    if not root:
        return None
    d = os.path.join(root, "tools")
    if create:
        os.makedirs(d, exist_ok=True)
    return d if os.path.isdir(d) else None


def icon_dir(create: bool = False):
    """<博客>/public/uploads/ico —— 本地图标存放处"""
    root = blog_root()
    if not root:
        return None
    d = os.path.join(root, "public", "uploads", "ico")
    if create:
        os.makedirs(d, exist_ok=True)
    return d if os.path.isdir(d) else None


def meta_path():
    d = tools_root()
    return os.path.join(d, "tools.json") if d else ""


def read_tools() -> list:
    """读 tools.json；文件不存在/坏了都当空列表，别把控制台搞崩"""
    p = meta_path()
    if not p or not os.path.isfile(p):
        return []
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        items = data if isinstance(data, list) else data.get("tools", [])
        return [t for t in items if isinstance(t, dict) and t.get("dir")]
    except Exception as e:
        print(f"[工具] ⚠️ 读 tools.json 失败: {e}")
        return []


def write_tools(items: list) -> None:
    """写 tools.json（先写临时文件再替换，避免写一半把清单弄坏）"""
    p = meta_path()
    if not p:
        raise RuntimeError("博客路径没配置好")
    payload = {"updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "tools": items}
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, p)


def dir_problems(name: str) -> dict:
    """检查目录名是否合法；返回 {ok, illegal:[...], reserved:bool, reason}"""
    name = (name or "").strip()
    illegal = sorted({ch for ch in name if ch in ILLEGAL_CHARS or ord(ch) < 32 or ord(ch) > 126})
    reserved = name.upper().split(".")[0] in RESERVED_NAMES
    ok = bool(DIR_RE.match(name)) and not illegal and not reserved
    reason = ""
    if not name:
        reason = "名称不能为空"
    elif illegal:
        reason = "含不允许的字符"
    elif reserved:
        reason = "Windows 保留名，换一个"
    elif not DIR_RE.match(name):
        reason = "只允许字母/数字开头，且只能用字母、数字、. _ -（不能有中文）"
    return {"ok": ok, "illegal": illegal, "reserved": reserved, "reason": reason}


def safe_child(base: str, rel: str) -> str:
    """把相对路径拼到 base 下，并保证结果仍在 base 里面（防目录穿越）"""
    base_abs = os.path.abspath(base)
    target = os.path.abspath(os.path.join(base_abs, *[s for s in (rel or "").split("/") if s not in ("", ".")]))
    if target != base_abs and not target.startswith(base_abs + os.sep):
        raise ValueError("路径越界")
    return target


# ---------------------------------------------------------------- 接口
@router.get("/list")
async def list_tools():
    root = blog_root()
    return {
        "success": True,
        "tools": read_tools(),
        "toolsDir": tools_root() or "",
        "blogPath": root,
        "configured": bool(root),
    }


@router.post("/save")
async def save_tool(request: Request):
    """
    新增 / 编辑一个工具。

    body: { origDir?, dir, name, entry, description?, icon?, tags?[] }
      · origDir 有值且和 dir 不一样 → 把文件夹改名（目录名就是地址栏里那一段）
      · 文件夹不存在就创建
      · 清单里按 dir 覆盖/新增（保持原顺序）
    """
    try:
        root = blog_root()
        if not root:
            return {"success": False, "message": "没配置博客路径（设置 → 双轨配置 里填 TLBlog 路径）"}

        data = await request.json()
        if not isinstance(data, dict):
            data = {}
        orig_dir = str(data.get("origDir") or "").strip()
        dir_name = str(data.get("dir") or "").strip()
        name = str(data.get("name") or "").strip()
        entry = str(data.get("entry") or "").strip().replace("\\", "/").lstrip("/")
        description = str(data.get("description") or "").strip()
        icon = str(data.get("icon") or "").strip()
        # 工具页导航栏主题：6 个预设 = 明暗(auto/dark/light) × 透明度(trans/solid)，外加 hidden
        # 老数据兼容：dark → dark-trans、light → light-solid（和当初的行为一致）
        nav_theme = str(data.get("navTheme") or "auto").strip()
        if nav_theme == "dark":
            nav_theme = "dark-trans"
        elif nav_theme == "light":
            nav_theme = "light-solid"
        if nav_theme not in NAV_THEMES:
            nav_theme = "auto"
        tags = data.get("tags") or []
        if isinstance(tags, str):
            tags = [t.strip() for t in re.split(r"[,，\s]+", tags) if t.strip()]
        tags = [str(t).strip() for t in tags if str(t).strip()]

        chk = dir_problems(dir_name)
        if not chk["ok"]:
            return {"success": False, "message": f"目录名不合法：{chk['reason']}", **chk}
        if not name:
            return {"success": False, "message": "请填写工具名称"}
        if not entry:
            return {"success": False, "message": "请选择要运行的主网页文件"}

        tdir = tools_root(create=True)
        src = os.path.join(tdir, orig_dir) if orig_dir else None
        dst = os.path.join(tdir, dir_name)

        # ① 改名：只改文件夹，里面东西原样跟着走
        if orig_dir and orig_dir != dir_name:
            if not os.path.isdir(src):
                return {"success": False, "message": f"原目录不存在：tools/{orig_dir}"}
            if os.path.exists(dst):
                return {"success": False, "message": f"tools/{dir_name} 已经存在了，换个名字或者先在那边删掉"}
            os.rename(src, dst)
            print(f"[工具] 📦 目录改名 tools/{orig_dir} → tools/{dir_name}")

        # ② 目录不存在就创建
        if not os.path.isdir(dst):
            os.makedirs(dst, exist_ok=True)
            print(f"[工具] 📁 新建工具目录 tools/{dir_name}")

        # ③ 入口文件检查（没有就提示，但仍然保存 —— 可能文件还没放上来）
        entry_abs = safe_child(dst, entry)
        entry_missing = not os.path.isfile(entry_abs)

        # ④ 写清单
        items = read_tools()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        row = {
            "name": name,
            "dir": dir_name,
            "entry": entry,
            "description": description,
            "icon": icon,
            "tags": tags,
            "navTheme": nav_theme,
        }
        hit = False
        for i, t in enumerate(items):
            if t.get("dir") in {dir_name, orig_dir}:
                row["created"] = t.get("created") or now
                items[i] = row
                hit = True
                break
        if not hit:
            row["created"] = now
            items.append(row)
        write_tools(items)

        msg = "已保存"
        if entry_missing:
            msg += f"（提示：tools/{dir_name}/{entry} 这个文件现在还不存在，放上去之后就能打开了）"
        return {"success": True, "message": msg, "tools": items, "dir": dir_name, "entryMissing": entry_missing}
    except Exception as e:
        print(f"[工具] ❌ 保存失败: {e}")
        return {"success": False, "message": f"保存失败：{e}"}


@router.post("/delete")
async def delete_tool(request: Request):
    """删掉一个工具：文件夹挪进 tools/.trash/（可手动找回），清单里去掉"""
    try:
        data = await request.json()
        if not isinstance(data, dict):
            data = {}
        dir_name = str(data.get("dir") or "").strip()
        purge = bool(data.get("purge"))
        if not dir_name:
            return {"success": False, "message": "缺少目录名"}

        tdir = tools_root()
        if not tdir:
            return {"success": False, "message": "工具目录不存在"}

        target = os.path.join(tdir, dir_name)
        if os.path.isdir(target):
            if purge:
                shutil.rmtree(target, ignore_errors=True)
                print(f"[工具] 🔥 永久删除 tools/{dir_name}")
            else:
                trash = os.path.join(tdir, ".trash")
                os.makedirs(trash, exist_ok=True)
                dst = os.path.join(trash, f"{dir_name}-{datetime.now().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(2)}")
                shutil.move(target, dst)
                print(f"[工具] 🗑️ tools/{dir_name} → tools/.trash/{os.path.basename(dst)}")

        items = [t for t in read_tools() if t.get("dir") != dir_name]
        write_tools(items)
        return {"success": True, "message": "已删除", "tools": items}
    except Exception as e:
        print(f"[工具] ❌ 删除失败: {e}")
        return {"success": False, "message": f"删除失败：{e}"}


@router.get("/browse")
async def browse(path: str = "", mode: str = "dir"):
    """
    目录 / 文件浏览器（给两个"浏览"小对话框用）。

    · mode=dir  → 只回文件夹（选「网页项目路径」用）
    · mode=file → 文件夹 + 文件（选「主网页文件名」用）
    path 是**相对博客根**的路径，空 = 博客根目录。
    """
    try:
        root = blog_root()
        if not root:
            return {"success": False, "message": "没配置博客路径", "dirs": [], "files": []}

        cur = safe_child(root, path)
        rel = os.path.relpath(cur, root).replace("\\", "/")
        rel = "" if rel == "." else rel

        # 目录不存在时要如实回答（exists=False）：控制台那边靠它提示
        # "这个工具目录还没建/主网页文件名对不上"。以前这里是悄悄退回根目录列内容，
        # 前端根本分不清"目录不存在"和"目录是空的" ✗
        if not os.path.isdir(cur):
            parent = rel.rsplit("/", 1)[0] if "/" in rel else ""
            return {"success": True, "path": rel, "parent": parent, "dirs": [], "files": [], "exists": False}

        dirs, files = [], []
        for name in sorted(os.listdir(cur), key=lambda s: s.lower()):
            if name.startswith("."):
                continue
            full = os.path.join(cur, name)
            child_rel = f"{rel}/{name}" if rel else name
            if os.path.isdir(full):
                if name in SKIP_DIRS:
                    continue
                dirs.append({"name": name, "path": child_rel})
            elif mode == "file":
                files.append({"name": name, "path": child_rel, "ext": os.path.splitext(name)[1].lower()})

        parent = ""
        if rel:
            parent = rel.rsplit("/", 1)[0] if "/" in rel else ""
        return {"success": True, "path": rel, "parent": parent, "dirs": dirs, "files": files, "exists": True}
    except Exception as e:
        return {"success": False, "message": f"读取目录失败：{e}", "dirs": [], "files": []}


@router.get("/icons")
async def list_icons():
    """本地图标（<博客>/public/uploads/ico 里的文件）"""
    d = icon_dir(create=True)
    if not d:
        return {"success": False, "message": "没配置博客路径", "icons": []}
    out = []
    for name in sorted(os.listdir(d), key=lambda s: s.lower()):
        ext = os.path.splitext(name)[1].lower()
        if ext not in ICON_EXTS or name.startswith("."):
            continue
        out.append({"name": os.path.splitext(name)[0], "file": name, "url": f"/uploads/ico/{name}"})
    return {"success": True, "icons": out, "dir": d}


@router.post("/icon/upload")
async def upload_icon(file: UploadFile = File(...)):
    """传一个本地图标 → 存到 public/uploads/ico，返回可直接用的 URL（前后台立刻可见）"""
    try:
        d = icon_dir(create=True)
        if not d:
            return {"success": False, "message": "没配置博客路径（设置 → 双轨配置）"}

        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ICON_EXTS:
            return {"success": False, "message": f"不支持的图标格式：{ext or '（没有扩展名）'}"}

        stem = re.sub(r"[^A-Za-z0-9_\-]+", "-", os.path.splitext(os.path.basename(file.filename or "icon"))[0]).strip("-")[:40] or "icon"
        name = f"{stem}-{datetime.now().strftime('%Y%m%d%H%M%S')}{ext}"
        dst = os.path.join(d, name)

        content = await file.read()
        with open(dst, "wb") as f:
            f.write(content)

        print(f"[工具] 🖼️ 图标已上传: public/uploads/ico/{name}")
        return {"success": True, "url": f"/uploads/ico/{name}", "name": os.path.splitext(name)[0]}
    except Exception as e:
        return {"success": False, "message": f"上传失败：{e}"}


# ──────────────────────────── 网络图标（Iconify 聚合库） ────────────────────────────
# 为什么走服务端转发：api.iconify.design 在国内经常连不上，浏览器直接去取会一片空白 ✗
# 所以搜索/取形状都由**服务器**去拿，浏览器只跟我们自己的后端说话 ✓
# 选中的图标会**下载到本地** public/uploads/ico/，之后就是普通本地图标，不依赖外网 ✓

ICONIFY = "https://api.iconify.design"

# 来源下拉里列出来的图标库（想加哪个直接往这里加一行）
ICON_SETS = [
    {"prefix": "mdi", "label": "Material Design Icons"},
    {"prefix": "material-symbols", "label": "Material Symbols"},
    {"prefix": "tabler", "label": "Tabler Icons"},
    {"prefix": "lucide", "label": "Lucide"},
    {"prefix": "ph", "label": "Phosphor"},
    {"prefix": "heroicons", "label": "Heroicons"},
    {"prefix": "carbon", "label": "Carbon"},
    {"prefix": "bi", "label": "Bootstrap Icons"},
    {"prefix": "ri", "label": "Remix Icon（中国团队）"},
    {"prefix": "ant-design", "label": "Ant Design 图标（蚂蚁/阿里系）"},
    {"prefix": "icon-park-outline", "label": "IconPark 线性（字节）"},
    {"prefix": "icon-park", "label": "IconPark 填充（字节）"},
    {"prefix": "tdesign", "label": "TDesign 图标（腾讯）"},
    {"prefix": "fluent", "label": "Fluent UI"},
    {"prefix": "simple-icons", "label": "品牌 Logo（Simple Icons）"},
    {"prefix": "logos", "label": "品牌 Logo（SVG Logos）"},
]

# 搜过的关键字缓存（同一批结果不用反复求 Iconify）
_ICON_CACHE: dict = {}
# 图标形状统一用 currentColor：前端渲染走的是 CSS mask + background:currentColor，
# 颜色由页面主题决定（深色模式自动变白）；万一被当 <img> 用也只是黑色，不会跑偏。
_ICON_FILL = "currentColor"


def _svg_wrap(body: str, w, h) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'width="32" height="32" fill="{_ICON_FILL}">{body}</svg>'
    )


@router.get("/icon/sets")
async def icon_sets():
    """网络图标的可选来源（下拉用）"""
    return {"success": True, "sets": ICON_SETS}


@router.get("/icon/search")
async def icon_search(q: str = "", prefix: str = "", limit: int = 48):
    """按关键字搜网络图标；结果里直接带回 SVG 形状，前端一次请求就能画出来"""
    q = (q or "").strip()
    if not q:
        return {"success": True, "icons": [], "message": "输入关键字开始搜索"}

    try:
        limit = max(1, min(int(limit or 48), 96))
    except Exception:
        limit = 48

    key = (q.lower(), prefix or "", limit)
    if key in _ICON_CACHE:
        return {"success": True, "icons": _ICON_CACHE[key], "cached": True}

    try:
        params = {"query": q, "limit": limit}
        if prefix:
            params["prefix"] = prefix

        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(f"{ICONIFY}/search", params=params)
            res.raise_for_status()
            names = (res.json() or {}).get("icons") or []
            if not names:
                return {"success": True, "icons": [], "message": f"没搜到「{q}」相关的图标"}

            # Iconify 可以按库批量取：一次请求拿回这一库里所有命中的形状
            grouped: dict = {}
            for full in names:
                if ":" not in full:
                    continue
                p, n = full.split(":", 1)
                grouped.setdefault(p, []).append(n)

            icons = []
            for p, names_in_set in grouped.items():
                r2 = await client.get(f"{ICONIFY}/{p}.json", params={"icons": ",".join(names_in_set)})
                if r2.status_code != 200:
                    continue
                data = r2.json() or {}
                w = data.get("width") or 24
                h = data.get("height") or 24
                for n, item in (data.get("icons") or {}).items():
                    body = (item or {}).get("body") or ""
                    if not body:
                        continue
                    icons.append({"name": f"{p}:{n}", "prefix": p, "svg": _svg_wrap(body, w, h)})

        _ICON_CACHE[key] = icons
        return {"success": True, "icons": icons}
    except Exception as e:
        return {
            "success": False,
            "icons": [],
            "message": f"取网络图标失败（服务器要能访问外网）：{e}",
        }


@router.post("/icon/import")
async def icon_import(request: Request):
    """把选中的网络图标**下载成本地文件**（public/uploads/ico/<库>-<名字>.svg），返回本地 URL"""
    try:
        data = await request.json()
        full = str((data or {}).get("name") or "").strip()
        if ":" not in full:
            return {"success": False, "message": "图标名不对（应该是 库:名字 这种写法）"}
        p, n = full.split(":", 1)

        d = icon_dir(create=True)
        if not d:
            return {"success": False, "message": "没配置博客路径（设置 → 双轨配置）"}

        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(f"{ICONIFY}/{p}.json", params={"icons": n})
            res.raise_for_status()
            data2 = res.json() or {}
            item = ((data2.get("icons") or {}).get(n)) or {}
            body = item.get("body") or ""
            w = data2.get("width") or 24
            h = data2.get("height") or 24

        if not body:
            return {"success": False, "message": "没取到这个图标的形状"}

        fname = f"{re.sub(r'[^A-Za-z0-9_.-]+', '-', p)}-{re.sub(r'[^A-Za-z0-9_.-]+', '-', n)}.svg"
        with open(os.path.join(d, fname), "w", encoding="utf-8") as f:
            f.write(_svg_wrap(body, w, h))

        print(f"[工具] ⬇️ 网络图标已存成本地图标: public/uploads/ico/{fname}")
        return {"success": True, "url": f"/uploads/ico/{fname}", "name": os.path.splitext(fname)[0]}
    except Exception as e:
        return {"success": False, "message": f"下载图标失败（服务器要能访问外网）：{e}"}


@router.post("/icon/import-font")
async def icon_import_font(request: Request):
    """
    🅰️ 接**阿里巴巴矢量图标库（iconfont.cn）里你自己的项目**。

    为什么是这种接法：iconfont 官方没有"无鉴权搜全站"的公开接口（它那个搜索 API 要登录态的
    ctoken，硬接等于让你把账号密码交出来 ✗）。但每个项目都能拿到一个 **Symbol 的 JS 链接**
    （形如 //at.alicdn.com/t/c/font_1234567_ab12cd.js），里面就是一堆标准 <symbol> 图形。
    这里把它扒下来，逐个存成 public/uploads/ico/iconfont-<名字>.svg —— 存完就是本地图标，
    前后台立刻能用，也不依赖 iconfont 的服务器。

    用法：iconfont.cn → 建项目 → 把想要的图标加进项目 → 「Symbol」→ 复制链接 → 粘进来。
    """
    try:
        data = await request.json()
        url = str((data or {}).get("url") or "").strip().replace("&amp;", "&").strip('"').strip("'")
        if not url:
            return {"success": False,
                    "message": "请填 iconfont 项目的在线链接（Symbol 标签 → 查看在线链接 → 复制那串 //at.alicdn.com/…js）"}

        # 有人会顺手把图标名（icon-xxx / tuichu 这种）粘进来 —— 明确告诉他去哪儿拿链接
        if re.fullmatch(r"[A-Za-z0-9_\-]+", url):
            return {"success": False,
                    "message": f"「{url}」看着是图标名，不是链接 —— 在项目里点「Symbol」标签，"
                               f"再点右侧「查看在线链接」，复制展开出来那串 //at.alicdn.com/…js 粘进来"}

        if url.startswith("//"):
            url = "https:" + url
        elif not url.startswith("http"):
            url = "https://" + url.lstrip("/")

        if "alicdn.com" not in url and "iconfont.cn" not in url:
            return {"success": False,
                    "message": "这看着不是 iconfont 的链接（应该是 at.alicdn.com/... 或 iconfont.cn/... 的 .js）"}

        if url.endswith(".css"):
            return {"success": False,
                    "message": "这是「Font class」的 .css，里面只有字体码点、没有图形 —— 请用「Symbol」那一栏的 .js 链接"}

        d = icon_dir(create=True)
        if not d:
            return {"success": False, "message": "没配置博客路径（设置 → 双轨配置）"}

        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            res = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            res.raise_for_status()
            js = res.text

        # 把每个 <symbol id="..." viewBox="...">…</symbol> 抠出来
        blocks = re.findall(r"<symbol\b[^>]*>[\s\S]*?</symbol>", js)
        saved = []
        for blk in blocks:
            open_end = blk.index(">")
            open_tag = blk[: open_end + 1]
            id_m = re.search(r'id="([^"]+)"', open_tag)
            vb_m = re.search(r'viewBox="([^"]+)"', open_tag)
            body = blk[open_end + 1: blk.rindex("</symbol>")].strip()
            if not (id_m and vb_m and body):
                continue
            raw_name = re.sub(r"^icon-", "", id_m.group(1))
            safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", raw_name).strip("-") or "icon"
            fname = f"iconfont-{safe}.svg"
            svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb_m.group(1)}" '
                   f'width="32" height="32" fill="{_ICON_FILL}">{body}</svg>')
            with open(os.path.join(d, fname), "w", encoding="utf-8") as f:
                f.write(svg)
            saved.append({"name": raw_name, "url": f"/uploads/ico/{fname}"})

        if not saved:
            return {"success": False,
                    "message": "这个链接里没解析出图标 —— 确认复制的是项目里「Symbol」那一栏的 .js 链接"}

        print(f"[工具] 🅰️ 从 iconfont 项目导入 {len(saved)} 个图标 → public/uploads/ico/")
        return {"success": True, "count": len(saved), "icons": saved}
    except Exception as e:
        return {"success": False, "message": f"导入失败（服务器要能访问外网）：{e}"}
