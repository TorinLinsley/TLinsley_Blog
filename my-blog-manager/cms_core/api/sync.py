import os
import shutil
from fastapi import APIRouter, Request

from cms_core.api.autosync import mirror_dir, describe_problems

router = APIRouter()

# 动态定位 Manager 根目录
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))

# 需要镜像覆盖的文件夹 (先清空目标，再全量复制)
SYNC_DIRS = ["posts", "chatters", "moments"]
# 🌟 resources 要特殊处理：控制台这边的「文章总目录」是 resources/ResShare/，
# 而博客前台读的是 <博客>/resources/（顶层）。所以同步时要把 ResShare 里的内容
# 「平铺」到博客的 resources/ 下，不能把 ResShare 这一层也带过去，
# 否则前台会找不到文章（前台代码里写死的就是顶层 resources/）。
SYNC_DIR_MAP = {
    "resources": "resources/ResShare",
}
# 需要精确覆盖的单文件
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

        # 1. 同步文件夹
        #    用和自动同步同一套「增量镜像」：先补新的、再删多余的，
        #    绝不先把目标清空 —— 否则那个瞬间博客前台的列表会突然变空。
        #    ⚠️ 删不掉的项会被收集下来（多半是前端文件属主/权限问题）：
        #       以前是静默忽略 → 你在控制台改了文件夹名，前端却多出一份旧的 ✗
        problems: list = []
        for d in SYNC_DIRS + list(SYNC_DIR_MAP.keys()):
            # 源目录可能和名字不同（比如 resources 的源其实是 resources/ResShare）
            src_rel = SYNC_DIR_MAP.get(d, d)
            src_dir = os.path.join(PROJECT_ROOT, src_rel.replace("/", os.sep))
            dst_dir = os.path.join(target_path, d)

            if os.path.exists(src_dir):
                mirror_dir(src_dir, dst_dir, problems)

        # 2. 同步单个文件 (直接覆盖或过滤)
        #    🧠 顺便记一下：**哪些"构建时才会打进产物"的文件真的变了**
        #       （siteConfig.ts / data/*.ts 是 import 进前台的，光拷文件不重建，
        #         前台还是旧的那份 —— 表现就是"控制台里背景图换好了，博客上没反应"）
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

                # 🌟 核心过滤逻辑：如果是 siteConfig.ts，拦截并剔除敏感信息
                if f == "siteConfig.ts":
                    with open(src_file, "r", encoding="utf-8") as file_in:
                        lines = file_in.readlines()

                    new = "".join(
                        line for line in lines
                        # 只要这一行包含以下关键词，直接跳过不写入
                        if not ("picBedName:" in line or "picBedUrl:" in line or "picBedToken:" in line or "图床核心配置" in line)
                    )
                    if new != old:
                        with open(dst_file, "w", encoding="utf-8") as file_out:
                            file_out.write(new)
                        build_touched.append(f)
                else:
                    # 其他普通文件：内容一样就不动它（免得白改 mtime）
                    if old is None or old != open(src_file, "r", encoding="utf-8").read():
                        shutil.copy2(src_file, dst_file)
                        build_touched.append(f)

        # 🧠 配置类文件（siteConfig.ts / data/*.ts）是**构建时打进前台产物**的：
        #    文件拷过去了，但不重建的话前台还是旧的那份 —— 所以这里明确提醒一句，
        #    免得又出现"控制台里背景图/音乐/徽章都换好了，博客上却没反应"。
        rebuild_hint = ""
        if build_touched:
            rebuild_hint = (
                f"\n\n⚠️ {'、'.join(build_touched)} 改动了 —— 这些是**构建时**打进前台产物的，"
                f"要在服务器上重建一次前台才生效：\n"
                f"bash /srv/www/rebuild-if-needed.sh tlblog"
            )

        if problems:
            # 详细清单打到后端日志；界面上给一句能照着做的短提示 ✓
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