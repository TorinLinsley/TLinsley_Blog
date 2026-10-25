import os
import shutil
from fastapi import APIRouter, Request

from cms_core.api.autosync import mirror_dir, describe_problems

router = APIRouter()

CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))

SYNC_DIRS = ["posts", "chatters", "moments"]
SYNC_DIR_MAP = {
    "resources": "resources/ResShare",
}
SYNC_FILES = [
    "app/about/about.md",
    "data/albums.ts",
    "data/friends.ts",
    "data/projects.ts",
    "siteConfig.ts"
]


def is_safe_blog_dir(target_path):
    """防呆检测：只有包含 package.json 的才被认为是安全的博客目录"""
    return os.path.exists(os.path.join(target_path, "package.json"))


@router.post("/check")
async def check_blog_path(request: Request):
    """检测目标路径是否合法且具备基本结构"""
    try:
        payload = await request.json()
        target_path = payload.get("blogPath", "").strip()

        if not target_path or not os.path.exists(target_path):
            return {"success": False, "message": "🚫 目标物理路径不存在，请检查输入！"}

        if not is_safe_blog_dir(target_path):
            return {"success": False,
                    "message": "⚠️ 危险！目标路径未检测到 package.json，似乎不是一个有效的前端项目，已拦截操作。"}

        missing = []
        for d in ["posts", "data", "app"]:
            if not os.path.exists(os.path.join(target_path, d)):
                missing.append(d)

        if missing:
            return {"success": True,
                    "message": f"✅ 路径安全。但目标缺失以下文件夹：{', '.join(missing)}。同步时将自动创建。"}

        return {"success": True, "message": "✅ 路径校验通过，目录结构完美！"}
    except Exception as e:
        return {"success": False, "message": f"校验异常: {str(e)}"}


@router.post("/execute")
async def execute_sync(request: Request):
    """执行物理覆盖同步"""
    try:
        payload = await request.json()
        target_path = payload.get("blogPath", "").strip()

        if not is_safe_blog_dir(target_path):
            return {"success": False, "message": "安全拦截：目标路径不合法！"}

        problems: list = []
        for d in SYNC_DIRS + list(SYNC_DIR_MAP.keys()):
            src_rel = SYNC_DIR_MAP.get(d, d)
            src_dir = os.path.join(PROJECT_ROOT, src_rel.replace("/", os.sep))
            dst_dir = os.path.join(target_path, d)

            if os.path.exists(src_dir):
                mirror_dir(src_dir, dst_dir, problems)

        build_touched: list = []
        for f in SYNC_FILES:
            src_file = os.path.join(PROJECT_ROOT, f.replace("/", os.sep))
            dst_file = os.path.join(target_path, f.replace("/", os.sep))

            if os.path.exists(src_file):
                os.makedirs(os.path.dirname(dst_file), exist_ok=True)
                old = None
                if os.path.isfile(dst_file):
                    try:
                        with open(dst_file, "r", encoding="utf-8") as fh:
                            old = fh.read()
                    except Exception:
                        old = None

                if f == "siteConfig.ts":
                    with open(src_file, "r", encoding="utf-8") as file_in:
                        lines = file_in.readlines()

                    new = "".join(
                        line for line in lines
                        if not ("picBedName:" in line or "picBedUrl:" in line or "picBedToken:" in line or "图床核心配置" in line)
                    )
                    if new != old:
                        with open(dst_file, "w", encoding="utf-8") as file_out:
                            file_out.write(new)
                        build_touched.append(f)
                else:
                    if old is None or old != open(src_file, "r", encoding="utf-8").read():
                        shutil.copy2(src_file, dst_file)
                        build_touched.append(f)

        rebuild_hint = ""
        if build_touched:
            rebuild_hint = (
                f"\n\n⚠️ {'、'.join(build_touched)} 改动了 —— 这些是**构建时**打进前台产物的，"
                f"要在服务器上重建一次前台才生效：\n"
                f"bash /srv/www/rebuild-if-needed.sh tlblog"
            )

        if problems:
            print(describe_problems(problems, target_path))
            names = [os.path.basename(p[0] if isinstance(p, tuple) else p) for p in problems[:3]]
            moved = sum(1 for p in problems if isinstance(p, tuple) and p[1])
            more = f" 等 {len(problems)} 项" if len(problems) > 3 else ""
            if moved:
                return {
                    "success": True,
                    "message": (
                        f"⚠️ 有旧文件在前端删不掉：{'、'.join(names)}{more}，"
                        f"已挪进隐藏目录 .stale/（前台不会再显示它们了 ✓）。"
                        f"想彻底删掉：sudo find {target_path} -maxdepth 2 -type d -name .stale -exec rm -rf {{}} + ；"
                        f"想让以后能直接删：sudo chown -R blog:blog {target_path}"
                        + rebuild_hint
                    ),
                }
            return {
                "success": True,
                "message": (
                    f"⚠️ 有旧文件既删不掉也挪不动（父目录没写权限）：{'、'.join(names)}{more}。"
                    f"服务器上执行 sudo chown -R blog:blog {target_path} 后再同步一次。"
                    + rebuild_hint
                ),
            }

        return {"success": True, "message": "🎉 完美撒花！所有文章与配置已镜像覆盖至目标博客。" + rebuild_hint}
    except Exception as e:
        return {"success": False, "message": f"同步过程中发生致命错误: {str(e)}"}