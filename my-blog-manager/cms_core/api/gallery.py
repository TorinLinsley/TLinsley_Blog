import os
import json
from fastapi import APIRouter, Request

from .data_ts import read_ts_array

router = APIRouter()

# 🌟 核心修复：动态获取项目根目录
# __file__ 是当前文件的绝对路径
# os.path.dirname(__file__) 是 cms_core/api/
# 再向上两级就是项目根目录 my-blog-manager/
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))

# 🌟 根据你提供的位置，目标文件在项目根目录下的 data/albums.ts
ALBUMS_TS_PATH = os.path.join(PROJECT_ROOT, "data", "albums.ts")


@router.post("/sync")
async def sync_gallery(request: Request):
    """
    接收前端传来的全量相册数组，并将其物理重写回 data/albums.ts
    """
    try:
        payload = await request.json()
        albums_data = payload.get("albums", [])

        if not isinstance(albums_data, list):
            return {"success": False, "message": "数据格式非法，预期为数组"}

        # 1. 序列化数据（确保中文不乱码，缩进漂亮）
        json_str = json.dumps(albums_data, ensure_ascii=False, indent=2)

        # 2. 构造标准的 TypeScript 导出模板
        # 🛡️ 这种方式不依赖于绝对路径，只要相对位置不变，哪里都能跑
        ts_content = (
            "// 🛡️ 本文件由 TLinsley 控制台自动生成，请勿手动修改\n"
            "export interface Photo { url: string; caption?: string; }\n"
            "export interface Album { id: string; title: string; description: string; cover: string; date: string; photos: Photo[]; }\n\n"
            f"export const albums: Album[] = {json_str};"
        )

        # 3. 确保目录存在并执行覆盖写入
        os.makedirs(os.path.dirname(ALBUMS_TS_PATH), exist_ok=True)
        with open(ALBUMS_TS_PATH, "w", encoding="utf-8") as f:
            f.write(ts_content)

        return {
            "success": True,
            "message": f"📸 画廊物理文件已更新！已同步 {len(albums_data)} 个相册。"
        }
    except Exception as e:
        # 这里把具体的报错抛给前端方便排查
        return {"success": False, "message": f"同步失败: {str(e)}"}


@router.get("/list")
async def list_gallery():
    """🖼️ 按请求读 data/albums.ts，把相册列表给前端。

    ⚠️ 这个接口是「照片墙加相册 → 更新本地 → 新相册消失」那个 bug 的解药：
    data/albums.ts 是构建时打进 bundle 的，前端 `import { albums }` 拿到的永远是
    编译那一刻的快照；后端改写文件之后，页面刷新看到的还是旧数据。
    所以页面启动时改成问这里要，文件才是唯一真相。
    """
    albums = read_ts_array(ALBUMS_TS_PATH, "albums")
    return {"success": True, "albums": albums, "file": ALBUMS_TS_PATH}


@router.get("/debug_path")
async def debug_path():
    """用于检查当前后端锁定的物理路径"""
    return {
        "project_root": PROJECT_ROOT,
        "target_file": ALBUMS_TS_PATH,
        "exists": os.path.exists(ALBUMS_TS_PATH)
    }