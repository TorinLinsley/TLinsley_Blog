"""自动同步：控制台里改了任何「要发布的内容」，博客项目对应文件自动跟着变。

覆盖范围和「同步Blog」按钮完全一致：
    posts/  chatters/  moments/  resources/（源是 resources/ResShare/）
    app/about/about.md  data/albums.ts  data/friends.ts  data/projects.ts  siteConfig.ts

原理：后台线程每隔 1.5 秒给每个同步源算一次指纹（相对路径 + 修改时间 + 大小），
只有「控制台这边真的变了」的那一项才会被镜像过去。
启动时只记录基线、不做任何复制 —— 所以开机不会无脑覆盖博客。
"""
import os
import json
import time
import shutil
import hashlib
import threading

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))

# 目录型同步源：博客里的目标名 → 控制台里的源目录
SYNC_DIRS = {
    "posts": "posts",
    "chatters": "chatters",
    "moments": "moments",
    # 🌟 文章总目录在控制台这边是 resources/ResShare，博客前台读的是顶层 resources/
    "resources": "resources/ResShare",
}

# 文件型同步源（相对控制台根目录）
SYNC_FILES = [
    "app/about/about.md",
    "data/albums.ts",
    "data/friends.ts",
    "data/projects.ts",
    "siteConfig.ts",
]

POLL_SECONDS = 1.5

_lock = threading.Lock()
_started = False
_baseline = {}
# 最近一次同步里「前端删不掉」的路径（前端会多出这些旧文件），给接口/界面用 ✓
LAST_PROBLEMS: list = []


def _remove(path: str) -> bool:
    """删掉一个文件/目录；删不掉就返回 False（**不再静默吞掉**）。

    ⚠️ 以前这里写的是 shutil.rmtree(..., ignore_errors=True) / except OSError: pass。
       结果：目标里的旧文件夹如果**属主不是控制台跑的那个用户**（比如你手工用 root 传上去的），
       删不掉却一声不吭 —— 表现就是「在控制台改了文件夹名字，前端多出一份旧的」✗
    """
    try:
        if os.path.isdir(path) and not os.path.islink(path):
            shutil.rmtree(path)
        else:
            os.remove(path)
        return True
    except OSError:
        return False


# 删不掉的东西往这里挪（点开头的目录，博客前台扫描时直接跳过）
STALE_DIR = ".stale"


def _quarantine(path: str, stale_root: str):
    """删不掉 → 挪进**镜像根目录下**的 .stale/ 。返回挪过去之后的路径，挪不动就返回 None。

    为什么这一招管用：
      · 删一个 root 属主的目录，要动它**里面的**文件（没权限 ✗）；
        而**改名**只需要父目录的写权限（有 ✓）—— 所以能挪走 ✓
      · 博客前台 buildTree() 里 `name.startsWith('.')` 会 continue，
        点开头的目录根本进不了列表 → 对前台来说就等于**删掉了** ✓
      · 镜像自己的清理阶段也跳过点开头的名字，所以这个目录不会被反复折腾 ✓
    """
    try:
        os.makedirs(stale_root, exist_ok=True)
        target = os.path.join(stale_root, f"{int(time.time())}-{os.path.basename(path)}")
        shutil.move(path, target)
        return target
    except Exception:
        return None


def mirror_dir(src: str, dst: str, problems: list | None = None, stale_root: str | None = None):
    """把 src 镜像到 dst —— 关键是「不清空」。

    老写法是先 rmtree(dst) 再 copytree，中间那个窗口里目标目录是空的
    （博客前台的列表会瞬间变空、看起来就像文件夹被删了），
    万一复制中途失败还会永久残缺。

    改成增量镜像：先把新的/变了的补过去，再删掉源里已经不存在的项。
    目标目录在任何时刻都是一份完整的内容，不会出现空窗。

    problems：可选的收集列表 —— 删不掉的项以 (原路径, 挪到哪儿了|None) 记进去，
    由调用方报给用户 ✓
    stale_root：删不掉的东西统一挪到哪（只在最外层算一次，默认 <dst>/.stale）✓
    """
    if stale_root is None:
        stale_root = os.path.join(dst, STALE_DIR)
    os.makedirs(dst, exist_ok=True)

    try:
        src_names = [n for n in os.listdir(src) if not n.startswith(".")]
    except OSError:
        src_names = []
    src_set = set(src_names)

    # 1. 补新的 / 覆盖变了的
    for name in src_names:
        sp = os.path.join(src, name)
        dp = os.path.join(dst, name)
        if os.path.isdir(sp):
            if os.path.exists(dp) and not os.path.isdir(dp):
                _remove(dp) or _quarantine(dp, stale_root)  # 类型冲突：文件换成目录
            mirror_dir(sp, dp, problems, stale_root)
        else:
            if os.path.isdir(dp):
                _remove(dp) or _quarantine(dp, stale_root)  # 类型冲突：目录换成文件
            shutil.copy2(sp, dp)

    # 2. 删掉源里已经没有的（点开头的内部文件不碰）
    try:
        dst_names = os.listdir(dst)
    except OSError:
        dst_names = []
    for name in dst_names:
        if name.startswith(".") or name in src_set:
            continue
        dp = os.path.join(dst, name)
        if not _remove(dp):
            moved = _quarantine(dp, stale_root)
            if problems is not None:
                problems.append((dp, moved))


def blog_root():
    """读 data/deploy_config.json 里的博客物理路径；无效就返回 None（那就不同步）"""
    cfg_path = os.path.join(PROJECT_ROOT, "data", "deploy_config.json")
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        return None
    target = str(cfg.get("blogPath") or "").strip()
    if not target or not os.path.isdir(target):
        return None
    # 和 sync.py 一样的防呆：必须是真正的博客项目，绝不乱复制
    if not os.path.exists(os.path.join(target, "package.json")):
        return None
    return target


def _dir_fp(path: str) -> str:
    if not os.path.isdir(path):
        return "missing"
    h = hashlib.md5()
    for dirpath, dirnames, filenames in os.walk(path):
        dirnames.sort()
        filenames.sort()
        for n in dirnames + filenames:
            p = os.path.join(dirpath, n)
            try:
                st = os.stat(p)
            except OSError:
                continue
            rel = os.path.relpath(p, path)
            h.update(f"{rel}|{st.st_mtime_ns}|{st.st_size}|".encode("utf-8", "ignore"))
    return h.hexdigest()


def _file_fp(path: str) -> str:
    try:
        st = os.stat(path)
        return f"{st.st_mtime_ns}|{st.st_size}"
    except OSError:
        return "missing"


def _snapshot() -> dict:
    snap = {}
    for name, src_rel in SYNC_DIRS.items():
        snap[f"dir:{name}"] = _dir_fp(os.path.join(PROJECT_ROOT, src_rel.replace("/", os.sep)))
    for rel in SYNC_FILES:
        snap[f"file:{rel}"] = _file_fp(os.path.join(PROJECT_ROOT, rel.replace("/", os.sep)))
    return snap


def _copy_site_config(src: str, dst: str):
    """siteConfig.ts 必须走和「同步Blog」相同的过滤：图床密钥那几个字段绝不能进博客"""
    with open(src, "r", encoding="utf-8") as fin:
        lines = fin.readlines()
    with open(dst, "w", encoding="utf-8") as fout:
        for line in lines:
            if "picBedName:" in line or "picBedUrl:" in line or "picBedToken:" in line or "图床核心配置" in line:
                continue
            fout.write(line)


def sync_now(only=None, verbose: bool = True) -> bool:
    """立刻同步一次。only 用来只同步变化的项，例如 {'dir:posts', 'file:siteConfig.ts'}

    返回值语义不变（True = 博客路径可用、跑完了）；「删不掉的项」会打印/收集出来，
    见下面的 problems —— 别再把它们悄悄吞掉 ✓
    """
    blog = blog_root()
    if not blog:
        if verbose:
            print("[自动同步] ⏭️ 博客路径无效，已跳过（控制台照常工作）")
        return False

    problems: list = []

    for name, src_rel in SYNC_DIRS.items():
        key = f"dir:{name}"
        if only and key not in only:
            continue
        src = os.path.join(PROJECT_ROOT, src_rel.replace("/", os.sep))
        dst = os.path.join(blog, name)
        if not os.path.isdir(src):
            continue
        try:
            # 增量镜像：不清空目标，所以博客前台不会看到「目录突然变空」
            with _lock:
                mirror_dir(src, dst, problems)
            if verbose:
                print(f"[自动同步] 🔄 {name}/ 已同步到博客")
        except Exception as e:
            print(f"[自动同步] ⚠️ {name}/ 同步失败（不影响控制台）: {e}")

    for rel in SYNC_FILES:
        key = f"file:{rel}"
        if only and key not in only:
            continue
        src = os.path.join(PROJECT_ROOT, rel.replace("/", os.sep))
        dst = os.path.join(blog, rel.replace("/", os.sep))
        if not os.path.exists(src):
            continue
        try:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if rel == "siteConfig.ts":
                _copy_site_config(src, dst)
            else:
                shutil.copy2(src, dst)
            if verbose:
                print(f"[自动同步] 🔄 {rel} 已同步到博客")
        except Exception as e:
            print(f"[自动同步] ⚠️ {rel} 同步失败（不影响控制台）: {e}")

    if problems:
        LAST_PROBLEMS[:] = problems
        print(describe_problems(problems, blog))
    else:
        LAST_PROBLEMS.clear()

    return True


def describe_problems(problems: list, blog: str = "") -> str:
    """把「前端删不掉的项」写成一段能直接照着做的提示 ✓

    problems 里每项要么是 (原路径, 挪到哪了) 的元组，要么是裸路径（老格式兜底）。
    """
    moved, stuck = [], []
    for p in problems:
        if isinstance(p, tuple):
            (moved if p[1] else stuck).append(p)
        else:
            stuck.append((p, None))

    lines = ["", "=" * 62]
    if moved:
        lines += [
            f"[自动同步] ⚠️ 有 {len(moved)} 项在前端删不掉（属主多半不是控制台跑的那个用户），",
            "  已经用「改名」挪进隐藏目录 .stale/ —— 博客前台扫描时会跳过点开头的目录，",
            "  所以**前台已经不会再显示它们了** ✓",
        ]
        for src, tgt in moved[:20]:
            lines.append(f"    {src}")
            lines.append(f"      → {tgt}")
        if len(moved) > 20:
            lines.append(f"    …（还有 {len(moved) - 20} 项）")
    if stuck:
        lines += [
            f"[自动同步] ⚠️ 有 {len(stuck)} 项连挪都挪不动（父目录没有写权限）：",
        ]
        for src, _ in stuck[:20]:
            lines.append(f"    {src}")
        if len(stuck) > 20:
            lines.append(f"    …（还有 {len(stuck) - 20} 项）")

    if moved or stuck:
        lines += [
            "  想彻底清理（顺手省空间）：",
            f"    sudo find {blog or '/srv/www/tlblog'} -maxdepth 2 -type d -name .stale -exec rm -rf {{}} +",
            "  想让以后能直接删、不用挪：",
            f"    sudo chown -R blog:blog {blog or '/srv/www/tlblog'}",
            "  ⚠️ 另外记住：resources 以控制台为准 —— 前端多出来的东西都会被当成多余项，",
            "     要加文章请传到控制台的 resources/ResShare/（或控制台里新建）✓",
            "=" * 62,
            "",
        ]
    return "\n".join(lines)


def _watch_loop():
    global _baseline
    while True:
        time.sleep(POLL_SECONDS)
        try:
            snap = _snapshot()
            changed = {k for k, v in snap.items() if _baseline.get(k) != v}
            _baseline = snap
            if changed:
                sync_now(only=changed)
        except Exception as e:
            print(f"[自动同步] 监测出错: {e}")


def start():
    """应用启动时调用一次：先记基线，之后只在「源发生变化」时才同步"""
    global _started, _baseline
    with _lock:
        if _started:
            return
        _started = True
        _baseline = _snapshot()
        threading.Thread(target=_watch_loop, name="blog-autosync", daemon=True).start()
        print("[自动同步] 👀 已启动：控制台里改了东西会自动同步到博客，不用再手点「同步Blog」")
