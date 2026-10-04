import os
import re
import json
import uuid
import shutil
import asyncio
import hashlib
import yaml
import markdown
from datetime import datetime
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from markdownify import markdownify as md
from .markdown_utils import (
    MathExtension,
    code_language_callback,
    collapse_blank_lines,
    render_callouts,
    restore_callouts,
    restore_tables,
    separate_blockquotes,
    split_callout_blockquotes,
    stash_callouts,
    stash_tables,
)

router = APIRouter()

# 🌟 物理锁死到 Manager 根目录下的 resources/
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))

# 📦 原总目录：现在只当「容器」用，里面放下面三样东西
RESOURCES_ROOT = os.path.join(PROJECT_ROOT, "resources")
# 📚 文章总目录：列表里能看到的一切都在这里（总目录已经换成这个）
RESOURCES_DIR = os.path.join(RESOURCES_ROOT, "ResShare")
# 🗑️ 回收站：删除 = 移动到这里。和文章总目录同级，所以列表永远扫不到它
TRASH_DIR = os.path.join(RESOURCES_ROOT, ".trash")
# 📝 删除记录：记下每一项被删前的位置，撤回（还原）时就靠它送回原地
TRASH_LOG = os.path.join(RESOURCES_ROOT, ".trash_log.json")

# Windows / Linux 都不允许的文件名字符
ILLEGAL_CHARS = r'[\\/:*?"<>|]'


# ────────────────────────── 路径工具 ──────────────────────────

def sanitize_name(name: str) -> str:
    """清掉非法字符，防止路径注入"""
    name = re.sub(ILLEGAL_CHARS, "", (name or "").strip())
    name = name.replace("\n", " ").replace("\r", " ")
    return name.strip(" .")


def safe_rel(path: str) -> str:
    """规范化前端传来的相对路径，并挡住目录穿越"""
    p = (path or "").replace("\\", "/").strip().strip("/")
    parts = [x for x in p.split("/") if x not in ("", ".")]
    if any(x == ".." for x in parts):
        raise ValueError("非法路径")
    return "/".join(parts)


def abs_path(rel: str) -> str:
    """相对文章总目录(ResShare) 的路径 → 绝对路径"""
    rel = safe_rel(rel)
    if not rel:
        return RESOURCES_DIR
    return os.path.join(RESOURCES_DIR, *rel.split("/"))


def rel_of(target_abs: str) -> str:
    """绝对路径 → 相对文章总目录的路径（给前端用）"""
    rel = os.path.relpath(target_abs, RESOURCES_DIR)
    if rel == ".":
        return ""
    return rel.replace(os.sep, "/")


def parent_of_rel(rel: str) -> str:
    return rel.rsplit("/", 1)[0] if "/" in rel else ""


def fs_error(action: str, e: Exception, path: str = "") -> str:
    """把文件系统错误翻译成人话 —— 尤其是最常踩的那种。

    ⚠️ Errno 13 / PermissionError 几乎永远是同一个原因：
       **这些文件/文件夹的属主不是控制台跑的那个用户**（控制台后端是 User=blog 的 systemd 服务），
       常见于"你手工用 root 通过 WinSCP 传上去 / 在服务器上 root 建的目录"。
       删不掉、改不了名、建不了子目录都是它 ✗
    """
    if isinstance(e, PermissionError) or getattr(e, "errno", None) == 13:
        # ⚠️ 这条会显示在控制台的红色提示条里，**不要写换行**（toast 会把换行吞掉、读起来黏成一团）
        return (
            f"{action}失败：没有权限（{path or '目标路径'}）。"
            "原因：这些文件的属主不是控制台跑的那个用户（blog）—— 多半是你手工用 root 传上去、"
            "或在服务器上用 root 建过的。在服务器上执行一次（两条一起，属主+写权限都交还给它）："
            "  sudo chown -R blog:blog /srv/www/console /srv/www/tlblog && "
            "sudo chmod -R u+rwX /srv/www/console /srv/www/tlblog"
            "  然后再操作就可以了 ✓"
        )
    return f"{action}失败: {e}"


def is_inside(child_abs: str, parent_abs: str) -> bool:
    """child 是否就是 parent 或位于 parent 里面"""
    child = os.path.abspath(child_abs)
    parent = os.path.abspath(parent_abs)
    return child == parent or child.startswith(parent + os.sep)


_MIGRATED = False


def ensure_root() -> str:
    global _MIGRATED
    os.makedirs(RESOURCES_DIR, exist_ok=True)
    os.makedirs(TRASH_DIR, exist_ok=True)
    if not _MIGRATED:
        migrate_legacy_root()
        _MIGRATED = True
    return RESOURCES_DIR


def migrate_legacy_root():
    """历史遗留：文章以前直接躺在 resources/ 下。
    总目录换到 ResShare 之后，第一次运行时把它们整体搬进去，避免文章「消失」。
    （幂等：搬过一次之后就再也不会触发）"""
    if not os.path.isdir(RESOURCES_ROOT):
        return
    try:
        names = os.listdir(RESOURCES_ROOT)
    except Exception:
        return
    keep = {os.path.basename(RESOURCES_DIR), os.path.basename(TRASH_DIR), os.path.basename(TRASH_LOG)}
    for name in names:
        if name in keep or name.startswith("."):
            continue
        src = os.path.join(RESOURCES_ROOT, name)
        try:
            dst_name = unique_name(RESOURCES_DIR, name, os.path.isfile(src))
            shutil.move(src, os.path.join(RESOURCES_DIR, dst_name))
            print(f"[资源分享] 📦 已把 {name} 迁移到 ResShare/")
        except Exception as e:
            print(f"[资源分享] ⚠️ 迁移 {name} 失败: {e}")


def unique_name(folder_abs: str, name: str, is_file: bool) -> str:
    """同名已存在时自动加序号（新文章 → 新文章 (2) → 新文章 (3)），像资源管理器那样"""
    if not os.path.exists(os.path.join(folder_abs, name)):
        return name
    if is_file:
        stem, ext = os.path.splitext(name)
    else:
        stem, ext = name, ""
    i = 2
    while os.path.exists(os.path.join(folder_abs, f"{stem} ({i}){ext}")):
        i += 1
    return f"{stem} ({i}){ext}"


# ────────────────────────── 删除记录（回收站账本） ──────────────────────────

def load_trash_log() -> dict:
    if not os.path.isfile(TRASH_LOG):
        return {"version": 1, "items": []}
    try:
        with open(TRASH_LOG, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {"version": 1, "items": []}
    if not isinstance(data, dict):
        return {"version": 1, "items": []}
    data.setdefault("version", 1)
    if not isinstance(data.get("items"), list):
        data["items"] = []
    return data


def save_trash_log(data: dict):
    os.makedirs(RESOURCES_ROOT, exist_ok=True)
    tmp = TRASH_LOG + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, TRASH_LOG)


def trash_item_dir(item: dict) -> str:
    """这一条记录在 .trash 里的存放目录"""
    return os.path.join(TRASH_DIR, item.get("store") or item.get("id") or "")


def trash_item_src(item: dict) -> str:
    """这一条记录里，被删东西当前的实际位置"""
    return os.path.join(trash_item_dir(item), item.get("fileName") or item.get("name") or "")


def trash_one(rel: str, log: dict) -> dict:
    """把一项移进回收站，并在账本里记下它原来的位置"""
    src = abs_path(rel)
    is_dir = os.path.isdir(src)
    base = os.path.basename(src)

    stamp = datetime.now()
    tid = f"{stamp.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    store_abs = os.path.join(TRASH_DIR, tid)
    os.makedirs(store_abs, exist_ok=True)

    # 整个搬过去：文件夹里的文章自然跟着一起走
    shutil.move(src, os.path.join(store_abs, base))

    item = {
        "id": tid,
        "name": os.path.splitext(base)[0] if not is_dir else base,
        "fileName": base,
        "type": "folder" if is_dir else "article",
        "origin": rel,                 # 删除前的完整相对路径 ← 还原的关键
        "parent": parent_of_rel(rel),  # 原来在哪个文件夹下
        "store": tid,
        "deletedAt": stamp.strftime("%Y-%m-%d %H:%M:%S"),
    }
    log["items"].insert(0, item)
    return item


# ────────────────────────── 文章读写 ──────────────────────────

def split_front_matter(raw: str):
    """拆出 front matter 和正文，返回 (meta字典, 正文)"""
    if not raw.strip().startswith("---"):
        return {}, raw
    parts = raw.split("---", 2)
    if len(parts) < 3:
        return {}, raw
    try:
        meta = yaml.safe_load(parts[1]) or {}
    except Exception:
        meta = {}
    return meta, parts[2].strip()


def read_title(md_file: str) -> str:
    try:
        with open(md_file, "r", encoding="utf-8") as f:
            meta, _ = split_front_matter(f.read())
        return str(meta.get("title", "") or "")
    except Exception:
        return ""


def build_tree() -> list:
    """递归扫描文章总目录：文件夹优先，文章按名字排序"""
    ensure_root()

    def scan(folder_abs: str, rel_prefix: str) -> list:
        folders, articles = [], []
        try:
            entries = sorted(os.listdir(folder_abs), key=lambda s: s.lower())
        except Exception:
            return []
        for name in entries:
            if name.startswith("."):
                continue
            full = os.path.join(folder_abs, name)
            rel = f"{rel_prefix}/{name}" if rel_prefix else name
            if os.path.isdir(full):
                folders.append({
                    "type": "folder",
                    "name": name,
                    "path": rel,
                    "children": scan(full, rel),
                })
            elif name.lower().endswith(".md"):
                articles.append({
                    "type": "article",
                    "name": read_title(full) or os.path.splitext(name)[0],
                    "fileName": name,
                    "path": rel,
                })
        return folders + articles

    return scan(RESOURCES_DIR, "")


# ────────────────────────── 接口 ──────────────────────────

def trash_items_payload() -> list:
    """回收站列表（给前端用），带 exists 标记方便前端判断东西还在不在"""
    log = load_trash_log()
    items = []
    for it in log["items"]:
        row = dict(it)
        row["exists"] = os.path.exists(trash_item_src(it))
        items.append(row)
    return items


# ────────────────────────── 实时监测（SSE） ──────────────────────────
# 文章总目录 / 回收站有点风吹草动（自己操作的、外部程序改的、你直接在系统里
# 删文件或往里面丢文件）都算「变了」，这里用指纹判断，变了就推给前端。

def _dir_fingerprint(root: str) -> str:
    if not os.path.isdir(root):
        return "missing"
    h = hashlib.md5()
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        filenames.sort()
        rel_dir = os.path.relpath(dirpath, root)
        for n in dirnames:
            h.update(("D|" + os.path.join(rel_dir, n)).encode("utf-8", "ignore"))
        for n in filenames:
            p = os.path.join(dirpath, n)
            try:
                st = os.stat(p)
            except OSError:
                continue
            h.update(("F|" + os.path.join(rel_dir, n)).encode("utf-8", "ignore"))
            h.update(f"{st.st_mtime_ns}|{st.st_size}|".encode())
    return h.hexdigest()


def current_revision() -> str:
    """文章总目录 + 回收站 + 删除记录的指纹，任何变化都会让指纹不同"""
    parts = [_dir_fingerprint(RESOURCES_DIR), _dir_fingerprint(TRASH_DIR)]
    try:
        parts.append(str(os.stat(TRASH_LOG).st_mtime_ns))
    except OSError:
        parts.append("0")
    return "|".join(parts)


@router.get("/watch")
async def watch_resources(request: Request):
    """实时推送：内容一变就推一份最新的列表给前端。
    前端只更新数据、不刷新页面，所以看不出任何闪烁。"""
    async def event_stream():
        last = None
        while True:
            if await request.is_disconnected():
                break
            try:
                rev = await asyncio.to_thread(current_revision)
            except Exception:
                rev = None
            if rev != last:
                last = rev
                try:
                    tree = await asyncio.to_thread(build_tree)
                    trash = await asyncio.to_thread(trash_items_payload)
                except Exception:
                    tree, trash = [], []
                payload = {"type": "change", "rev": rev, "tree": tree, "trash": trash, "count": len(trash)}
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            else:
                yield ": ping\n\n"
            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tree")
def resources_tree():
    try:
        return {"success": True, "tree": build_tree()}
    except Exception as e:
        return {"success": False, "message": f"读取目录失败: {str(e)}"}


@router.post("/get")
async def get_resource(request: Request):
    """读取一篇文章：同时给出编辑器要的 HTML 和预览要的 Markdown 正文"""
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    try:
        rel = safe_rel(payload.get("path", ""))
    except ValueError as e:
        return {"success": False, "message": str(e)}

    target = abs_path(rel)
    if not rel or not os.path.isfile(target):
        return {"success": False, "message": "文件不存在"}

    with open(target, "r", encoding="utf-8") as f:
        meta, body = split_front_matter(f.read())

    # 🧩 先把「一个引用块里连着写了好几个 callout」拆开（Obsidian 允许这么写，
    #    标准 Markdown 不允许 —— 不拆的话只有第一个能渲染成 callout，其余全是原文）
    body = split_callout_blockquotes(body)
    # 🧩 再把「空行分隔的相邻引用块」之间插一行 HTML 注释 —— python-markdown 会把它们
    #    并成一个引用块 ✗（CommonMark/Obsidian/前端 remark 都是分开的两个 ✓）
    #    不隔开的话：你分开写的引用块在控制台里糊成一坨、紧跟着的 [!info] 也不再是
    #    "引用块第一段" → callout 失效、退化成 `[!info]` 原文 ✗
    body = separate_blockquotes(body)

    # 🧮 MathExtension：不然预览里的 $…$ / $$…$$ 会被 markdown 吃掉反斜杠（$\{a\}$ → ${a}$、
    #    TeX 的 \\ 换行被吃成一个 \），还会被 nl2br 往公式中间插 <br> —— 前端怎么都渲染不出来
    html = markdown.markdown(
        body,
        extensions=["fenced_code", "codehilite", "tables", "nl2br", MathExtension()],
        extension_configs={
            # 🎨 同 drafts.py：预览要真的着色就得带 codehilite，并用内联颜色（不依赖 CSS 类名）
            "codehilite": {"noclasses": True, "pygments_style": "monokai", "guess_lang": False},
        },
    )
    # 🗂️ 再套 callout 外壳（以前这一步漏了，所以资源预览里 callout 一直是原始引用块）
    html = render_callouts(html)
    fallback = os.path.splitext(os.path.basename(rel))[0]

    return {
        "success": True,
        "path": rel,
        "title": str(meta.get("title", "") or fallback),
        "contentHtml": html,
        "contentMd": body,
    }


# ─────────────────────────────────────────────────────────────
# Markdown 里没有对应写法的内联标签：颜色(span style)、字号(span style)、
# 高亮(mark)、下划线(u)、上下标(sub/sup)。
# markdownify 转换时会把它们连同样式一起丢掉 —— 表现就是「改了颜色，一切换文章又变回原样」。
# 办法：转换前先把这些标签抠成占位符，转成 Markdown 之后原样放回去。
# Markdown 允许内嵌 HTML，博客前台（remark + allowDangerousHtml）和控制台预览都渲染得出来。
# ─────────────────────────────────────────────────────────────
# ⚠️ 这里用 (?![^>]*class="callout-) 把 **callout 自己的 span** 排除掉：
#    callout 的图标/标题就是 <span class="callout-icon"> / <span class="callout-title-text">，
#    它们马上会被 stash_callouts 转成 Markdown（> [!info] 标题）✓ 不需要保护。
#    不排除的话会被抠成占位符 → 取标题时拿到的是个占位符、只能退回兜底的 "Info" ✗
#    （callout **正文里**你自己加的颜色/字号 span 不在排除范围，照旧被保护 ✓）
_KEEP_INLINE_RE = re.compile(
    r"<(span|mark|u|sub|sup)\b(?![^>]*class=\"callout-)[^>]*>.*?</\1\s*>",
    re.S | re.I,
)
_INLINE_SLOT = "\ue000INLINE{}\ue001"  # 私用区字符，正文里不会出现，也不会被 Markdown 转义


def protect_inline_tags(html: str):
    """把需要原样保留的内联标签换成占位符，返回 (处理后的 HTML, 原标签列表)"""
    stash = []

    def _stash(m):
        stash.append(m.group(0))
        return _INLINE_SLOT.format(len(stash) - 1)

    return _KEEP_INLINE_RE.sub(_stash, html), stash


def restore_inline_tags(text: str, stash) -> str:
    """把占位符换回原来的标签"""
    for i, raw in enumerate(stash):
        text = text.replace(_INLINE_SLOT.format(i), raw)
    return text


def html_to_markdown(raw_html: str) -> str:
    """编辑器给的 HTML → 落盘的 Markdown。

    这里是全流程唯一的转换入口，抽出来是为了能单独测：
    空行保护 → 抠出带样式的内联标签 → markdownify → 放回标签。
    """
    # ⚠️ 空段落（编辑器里连按两下回车 = 一个空行）必须换成「段内硬换行 + 零宽连接符」，
    #    不能换成段与段之间的空行：段级空行落在引用块/callout 里会变成 ">   " 这种行，
    #    而不同 markdown 解析器对它处理不一致 —— 实测「存 → 读 → 再存」会把空行**丢掉** ✗
    #    （用户遇到的就是：手动加的空行，刷新一下就回到原样了）
    #    <br>&zwj; 这种"段内空行"是稳定的：来回存读一字不差 ✓
    raw_html = re.sub(
        r"<p>(?:\s|&nbsp;|&#12288;|\u200b|\u200d|\ufeff|<br\s*/?>)*</p>",
        "<br>\u200d",
        raw_html,
    )
    protected, stash = protect_inline_tags(raw_html)
    # 表格单独处理：markdownify 转出来的表格每行后面都会多一条分隔线，直接用不了
    protected, tables = stash_tables(protected)
    # 🧩 callout 外壳也先抠出来：不然 markdownify 会把里面的 <span>/<svg> 当裸 HTML
    #    吐进 .md ✗（表现：「保存一次，callout 样式全没了、满屏 span 标签」）
    protected, callouts = stash_callouts(protected)
    out = md(protected, heading_style="ATX", keep=["img", "br"], code_language_callback=code_language_callback)
    out = re.sub(r"<br\s*/?>", "\n\n", out)
    out = restore_tables(out, tables)
    out = restore_callouts(out, callouts)
    out = collapse_blank_lines(out)
    # 🧩 落盘前把连成一片的 callout 拆成独立引用块（不然下次读出来只有第一个是 callout）
    out = split_callout_blockquotes(out)
    # ⚠️ 这里**不**再往 .md 里插 `<!-- -->` 分隔符：
    #    分引用块的活儿放在**读取时**做（separate_blockquotes，只影响渲染、不写文件 ✓）——
    #    你的 .md 保持你原来的写法（`> a` 空行 `> b`），一个字都不多 ✓
    return restore_inline_tags(out, stash)


@router.post("/save")
async def save_resource(request: Request):
    """保存正文：编辑器给的是 HTML，这里按项目原有方式转成 Markdown 落盘"""
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    try:
        rel = safe_rel(payload.get("path", ""))
    except ValueError as e:
        return {"success": False, "message": str(e)}

    if not rel.lower().endswith(".md"):
        return {"success": False, "message": "只能保存 .md 文件"}

    target = abs_path(rel)
    if not os.path.isfile(target):
        return {"success": False, "message": "文件不存在"}

    raw_html = payload.get("content", "") or ""

    # 编辑器 HTML → Markdown（会保留颜色/字号/高亮这类 Markdown 表达不了的样式）
    md_content = html_to_markdown(raw_html)

    title = sanitize_name(payload.get("title", "")) or os.path.splitext(os.path.basename(rel))[0]

    with open(target, "r", encoding="utf-8") as f:
        meta, _ = split_front_matter(f.read())
    meta["title"] = title
    meta.setdefault("date", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

    final_text = f"---\n{yaml.dump(meta, allow_unicode=True, sort_keys=False)}---\n\n{md_content}"
    try:
        with open(target, "w", encoding="utf-8") as f:
            f.write(final_text)
    except Exception as e:
        return {"success": False, "message": f"写入失败: {str(e)}"}

    return {"success": True, "message": "已保存", "path": rel, "title": title}


@router.post("/create")
async def create_resource(request: Request):
    """新建文章或文件夹；parent 为空表示建在总目录下"""
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    try:
        parent = safe_rel(payload.get("parent", ""))
    except ValueError as e:
        return {"success": False, "message": str(e)}

    kind = payload.get("type", "article")
    name = sanitize_name(payload.get("name", ""))
    if not name:
        name = "新建文件夹" if kind == "folder" else "新文章"

    parent_abs = abs_path(parent) if parent else ensure_root()
    if not os.path.isdir(parent_abs):
        return {"success": False, "message": "父目录不存在"}

    if kind == "folder":
        name = unique_name(parent_abs, name, False)
        target = os.path.join(parent_abs, name)
        os.makedirs(target, exist_ok=True)
        rel = f"{parent}/{name}" if parent else name
        return {"success": True, "path": rel, "type": "folder", "name": name}

    file_name = name if name.lower().endswith(".md") else f"{name}.md"
    file_name = unique_name(parent_abs, file_name, True)
    target = os.path.join(parent_abs, file_name)
    fm = {
        "title": os.path.splitext(file_name)[0],
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    try:
        with open(target, "w", encoding="utf-8") as f:
            f.write(f"---\n{yaml.dump(fm, allow_unicode=True, sort_keys=False)}---\n\n")
    except Exception as e:
        return {"success": False, "message": fs_error("创建", e, target)}

    rel = f"{parent}/{file_name}" if parent else file_name
    return {"success": True, "path": rel, "type": "article", "name": fm["title"]}


@router.post("/delete")
async def delete_resource(request: Request):
    """删除 = 移进回收站（不是真删）。
    兼容两种传参：{path: "a.md"} 单选，{paths: [...]} 多选。
    文件夹会连同里面的文章一起进回收站，账本里记的是整个文件夹的原始位置。

    permanent: true = 永久删除（Shift+Delete 用的）：
    直接物理删掉，不进项目回收站，也不进操作系统回收站，删了就真没了。"""
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    raw_paths = payload.get("paths")
    if not isinstance(raw_paths, list) or not raw_paths:
        raw_paths = [payload.get("path", "")]
    permanent = bool(payload.get("permanent"))

    try:
        rels = [safe_rel(p) for p in raw_paths]
    except ValueError as e:
        return {"success": False, "message": str(e)}
    rels = [r for r in rels if r]
    if not rels:
        return {"success": False, "message": "不能删除根目录"}

    # ─────── 🔥 永久删除：直接物理删除，不写账本 ───────
    if permanent:
        purged, failed = [], []
        for rel in rels:
            target = abs_path(rel)
            if not os.path.exists(target):
                failed.append({"path": rel, "message": "目标不存在"})
                continue
            is_dir = os.path.isdir(target)
            base = os.path.basename(target)
            try:
                if is_dir:
                    shutil.rmtree(target)
                else:
                    os.remove(target)
            except Exception as e:
                failed.append({"path": rel, "message": fs_error("永久删除", e, target)})
                continue
            purged.append({
                "path": rel,
                "id": None,
                "name": base if is_dir else os.path.splitext(base)[0],
                "type": "folder" if is_dir else "article",
                "permanent": True,
            })
            print(f"[资源分享] 🔥 已永久删除 {rel}")

        if not purged:
            return {"success": False, "message": failed[0]["message"] if failed else "永久删除失败", "failed": failed}

        return {
            "success": True,
            "message": f"已永久删除 {len(purged)} 项（不可恢复）",
            "deleted": purged,
            "ids": [],
            "permanent": True,
            "failed": failed,
        }

    # ─────── 🗑️ 普通删除：移进回收站 ───────
    log = load_trash_log()
    deleted, failed = [], []
    for rel in rels:
        target = abs_path(rel)
        if not os.path.exists(target):
            failed.append({"path": rel, "message": "目标不存在"})
            continue
        try:
            item = trash_one(rel, log)
            deleted.append({"path": rel, "id": item["id"], "name": item["name"], "type": item["type"]})
            print(f"[资源分享] 🗑️ 已移入回收站 {rel} -> .trash/{item['store']}")
        except Exception as e:
            failed.append({"path": rel, "message": fs_error("删除", e, target)})

    try:
        save_trash_log(log)
    except Exception as e:
        return {"success": False, "message": f"写入回收站记录失败: {str(e)}"}

    if not deleted:
        return {"success": False, "message": failed[0]["message"] if failed else "删除失败", "failed": failed}

    return {
        "success": True,
        "message": f"已删除 {len(deleted)} 项（可在回收站还原）",
        "deleted": deleted,
        "ids": [d["id"] for d in deleted],
        "permanent": False,
        "failed": failed,
    }


@router.get("/trash")
def trash_list():
    """回收站里的东西（新的排在最上面）"""
    ensure_root()
    items = trash_items_payload()
    return {"success": True, "items": items, "count": len(items)}


@router.post("/restore")
async def restore_resource(request: Request):
    """撤回删除：把回收站里的东西搬回它原来的位置。
    如果原来的文件夹已经没了（也被删了），会自动重新建出来；
    如果原位已经被占用，就自动改名（xxx (2)），绝不覆盖。"""
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    ids = payload.get("ids")
    if not isinstance(ids, list) or not ids:
        one = payload.get("id")
        ids = [one] if one else []
    if not ids:
        return {"success": False, "message": "没有指定要还原的项目"}

    log = load_trash_log()
    restored, failed = [], []

    for tid in ids:
        item = next((x for x in log["items"] if x.get("id") == tid), None)
        if not item:
            failed.append({"id": tid, "message": "记录不存在"})
            continue

        src = trash_item_src(item)
        if not os.path.exists(src):
            failed.append({"id": tid, "name": item.get("name"), "message": "回收站里的内容已经不在了"})
            continue

        is_dir = os.path.isdir(src)
        rel = safe_rel(item.get("origin") or "")
        if not rel:
            failed.append({"id": tid, "name": item.get("name"), "message": "记录里缺少原始位置"})
            continue

        dst = abs_path(rel)
        parent_abs = os.path.dirname(dst)
        try:
            os.makedirs(parent_abs, exist_ok=True)  # 原来的文件夹没了就重建
        except Exception as e:
            failed.append({"id": tid, "name": item.get("name"), "message": f"无法重建原目录: {e}"})
            continue

        final_rel = rel
        if os.path.exists(dst):
            # 原位被占了：改名放回同一个文件夹里
            new_base = unique_name(parent_abs, os.path.basename(dst), not is_dir)
            dst = os.path.join(parent_abs, new_base)
            final_rel = rel_of(dst)

        try:
            shutil.move(src, dst)
        except Exception as e:
            failed.append({"id": tid, "name": item.get("name"), "message": f"还原失败: {e}"})
            continue

        # 清掉这一条在 .trash 里的空壳目录 + 账本记录
        shutil.rmtree(trash_item_dir(item), ignore_errors=True)
        log["items"] = [x for x in log["items"] if x.get("id") != tid]
        restored.append({"id": tid, "name": item.get("name"), "path": final_rel, "type": item.get("type")})
        print(f"[资源分享] ♻️ 已还原 {item.get('name')} -> {final_rel}")

    save_trash_log(log)
    ok = len(restored) > 0
    return {
        "success": ok,
        "message": (f"已还原 {len(restored)} 项" if ok else (failed[0]["message"] if failed else "还原失败")),
        "restored": restored,
        "failed": failed,
    }


@router.post("/trash/purge")
async def purge_trash(request: Request):
    """彻底删除：{ids:[...]} 删指定几条；{all:true} 清空回收站。删了就真没了。"""
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    log = load_trash_log()
    if payload.get("all"):
        targets = list(log["items"])
    else:
        ids = payload.get("ids")
        if not isinstance(ids, list):
            ids = [payload.get("id")] if payload.get("id") else []
        targets = [x for x in log["items"] if x.get("id") in ids]

    if not targets:
        return {"success": False, "message": "没有指定要清理的项目"}

    done, failed = [], []
    for item in targets:
        try:
            shutil.rmtree(trash_item_dir(item), ignore_errors=True)
            src = trash_item_src(item)
            if os.path.exists(src):
                os.remove(src)
            done.append(item.get("id"))
        except Exception as e:
            failed.append({"id": item.get("id"), "message": str(e)})

    log["items"] = [x for x in log["items"] if x.get("id") not in done]
    save_trash_log(log)
    return {"success": True, "message": f"已彻底删除 {len(done)} 项", "purged": done, "failed": failed}


@router.post("/move")
async def move_resources(request: Request):
    """拖拽移动：把一个或多个文章/文件夹移动到某个文件夹里。
    target 为空字符串表示移动到总目录根下。"""
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    raw_paths = payload.get("paths")
    if not isinstance(raw_paths, list) or not raw_paths:
        raw_paths = [payload.get("path", "")]

    try:
        rels = [safe_rel(p) for p in raw_paths]
        target_rel = safe_rel(payload.get("target", ""))
    except ValueError as e:
        return {"success": False, "message": str(e)}

    target_abs = abs_path(target_rel) if target_rel else ensure_root()
    if not os.path.isdir(target_abs):
        return {"success": False, "message": "目标文件夹不存在"}

    moved, skipped = [], []
    for rel in rels:
        if not rel:
            continue
        src = abs_path(rel)
        if not os.path.exists(src):
            skipped.append({"path": rel, "message": "目标不存在"})
            continue
        if os.path.isdir(src) and is_inside(target_abs, src):
            skipped.append({"path": rel, "message": "不能把文件夹移动到它自己里面"})
            continue
        if os.path.abspath(os.path.dirname(src)) == os.path.abspath(target_abs):
            skipped.append({"path": rel, "message": "已经在这个文件夹里了"})
            continue

        is_dir = os.path.isdir(src)
        base = os.path.basename(src)
        new_base = unique_name(target_abs, base, not is_dir)
        dst = os.path.join(target_abs, new_base)
        try:
            shutil.move(src, dst)
        except Exception as e:
            skipped.append({"path": rel, "message": fs_error("移动", e, src)})
            continue

        new_rel = rel_of(dst)
        moved.append({"from": rel, "to": new_rel, "renamed": new_base != base, "type": "folder" if is_dir else "article"})
        print(f"[资源分享] 📦 已移动 {rel} -> {new_rel}")

    if not moved:
        return {"success": False, "message": skipped[0]["message"] if skipped else "没有可移动的项目", "skipped": skipped}

    return {
        "success": True,
        "message": f"已移动 {len(moved)} 项",
        "moved": moved,
        "skipped": skipped,
    }


@router.post("/rename")
async def rename_resource(request: Request):
    """重命名文章或文件夹；文章会同步更新 front matter 里的 title"""
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    try:
        rel = safe_rel(payload.get("path", ""))
    except ValueError as e:
        return {"success": False, "message": str(e)}

    new_name = sanitize_name(payload.get("newName", ""))
    if not new_name:
        return {"success": False, "message": "名称不能为空"}

    src = abs_path(rel)
    if not rel or not os.path.exists(src):
        return {"success": False, "message": "目标不存在"}

    parent_rel = parent_of_rel(rel)
    parent_abs = abs_path(parent_rel) if parent_rel else ensure_root()

    is_file = os.path.isfile(src)
    if is_file and not new_name.lower().endswith(".md"):
        new_name = f"{new_name}.md"

    dst = os.path.join(parent_abs, new_name)
    if os.path.abspath(dst) == os.path.abspath(src):
        return {"success": True, "path": rel, "name": new_name}

    if os.path.exists(dst):
        return {"success": False, "message": "同名项已存在"}

    try:
        os.rename(src, dst)
    except Exception as e:
        # ⚠️ 这里最常见的就是 Errno 13（父目录属主不是 blog）—— 交给 fs_error 讲清楚怎么修 ✓
        return {"success": False, "message": fs_error("重命名", e, src)}

    # 文章：同步更新 front matter 的 title，否则列表上显示的还是旧名字
    if is_file:
        try:
            with open(dst, "r", encoding="utf-8") as f:
                meta, body = split_front_matter(f.read())
            meta["title"] = os.path.splitext(new_name)[0]
            meta.setdefault("date", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            with open(dst, "w", encoding="utf-8") as f:
                f.write(f"---\n{yaml.dump(meta, allow_unicode=True, sort_keys=False)}---\n\n{body}")
        except Exception:
            pass

    new_rel = f"{parent_rel}/{new_name}" if parent_rel else new_name
    return {"success": True, "path": new_rel, "name": os.path.splitext(new_name)[0]}
