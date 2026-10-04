from fastapi import APIRouter, Body, UploadFile, File, Form
import httpx
import os
import json
import re
import secrets
from datetime import datetime

router = APIRouter()

# ---------------------------------------------------------
# 🖥️ 本地图库：把图片直接存进博客项目的 public/uploads 目录
# ---------------------------------------------------------
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))
DEPLOY_CONFIG = os.path.join(PROJECT_ROOT, "data", "deploy_config.json")

# 只允许真正的图片格式，防止上传可执行文件
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif", ".bmp", ".ico"}
# 兜底上限：防止误传巨大文件把磁盘塞满。设成 0 表示完全不限制。
MAX_SIZE = 200 * 1024 * 1024

# 图片体积探测结果的缓存（url -> 字节数）。体积不会变，缓存住省得每次都去 HEAD。
_SIZE_CACHE: dict = {}


def _local_size(url: str):
    """把 /uploads/xxx 这种相对路径换算成磁盘上的真实文件大小；不是本地路径就返回 None"""
    if not url.startswith("/uploads/"):
        return None
    blog = get_blog_path()
    if not blog:
        return None
    p = os.path.join(blog, "public", "uploads", os.path.basename(url))
    try:
        return os.path.getsize(p) if os.path.isfile(p) else None
    except OSError:
        return None


def get_blog_path():
    """从 deploy_config.json 读取博客物理路径（和同步功能用的是同一个配置）"""
    try:
        with open(DEPLOY_CONFIG, "r", encoding="utf-8") as f:
            return (json.load(f).get("blogPath") or "").strip()
    except Exception:
        return ""


def get_upload_dir():
    """返回 <博客路径>/public/uploads，不存在就创建；不可用时返回 None"""
    blog_path = get_blog_path()
    if not blog_path or not os.path.isdir(blog_path):
        return None
    upload_dir = os.path.join(blog_path, "public", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


def build_safe_name(filename: str, ext: str) -> str:
    """生成不会撞名的安全文件名：原名-时间戳-随机码.扩展名"""
    stem = os.path.splitext(os.path.basename(filename or "image"))[0]
    stem = re.sub(r"[^A-Za-z0-9_\-]+", "-", stem).strip("-")[:40] or "image"
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"{stem}-{stamp}-{secrets.token_hex(3)}{ext}"


@router.post("/upload_local")
async def upload_local_image(file: UploadFile = File(...)):
    """
    把图片保存到博客项目的 public/uploads 目录（不需要任何图床）。
    返回的是相对路径 /uploads/xxx.jpg —— 本地和服务器都通用，
    图片会跟着项目文件一起走。
    """
    upload_dir = get_upload_dir()
    if not upload_dir:
        return {"success": False,
                "message": "未配置有效的博客路径，请到【设置 → 双轨配置】填写 TLBlog 路径并保存"}

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        return {"success": False, "message": f"不支持的图片格式：{ext or '未知'}（支持 jpg/png/gif/webp/svg/avif）"}

    name = build_safe_name(file.filename, ext)
    dest = os.path.join(upload_dir, name)

    # 流式写盘：大文件不会整个读进内存
    size = 0
    too_big = False
    try:
        with open(dest, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if MAX_SIZE and size > MAX_SIZE:
                    too_big = True
                    break
                out.write(chunk)
    except Exception as e:
        if os.path.exists(dest):
            os.remove(dest)
        return {"success": False, "message": f"写入磁盘失败: {str(e)}"}

    if too_big or size == 0:
        if os.path.exists(dest):
            os.remove(dest)
        if too_big:
            return {"success": False, "message": f"图片太大（超过 {MAX_SIZE / 1024 / 1024:.0f} MB），可在 picbed.py 里调整 MAX_SIZE"}
        return {"success": False, "message": "文件是空的"}

    print(f"[本地图库] ✅ 已保存 {name} ({size / 1024:.0f} KB) -> {upload_dir}")
    return {
        "success": True,
        "message": "已保存到博客本地目录",
        "url": f"/uploads/{name}",
        "file": name,
    }


@router.get("/local_list")
async def list_local_images():
    """
    列出博客项目 public/uploads 里**已经有**的图片（按修改时间倒序）。
    用途：对话框里的「服务器图库」页签 —— 你先把图片传到服务器那个目录，
    这里就能直接挑一张插进正文，不用再从本地上传一遍。
    """
    upload_dir = get_upload_dir()
    if not upload_dir:
        return {"success": False,
                "message": "未配置有效的博客路径，请到【设置 → 双轨配置】填写 TLBlog 路径并保存",
                "files": []}

    files = []
    try:
        for name in os.listdir(upload_dir):
            ext = os.path.splitext(name)[1].lower()
            if ext not in ALLOWED_EXT:
                continue
            full = os.path.join(upload_dir, name)
            if not os.path.isfile(full):
                continue
            try:
                st = os.stat(full)
            except OSError:
                continue
            files.append({
                "name": name,
                "url": f"/uploads/{name}",      # 相对路径：控制台预览和博客前台都通用
                "size": st.st_size,
                "mtime": int(st.st_mtime),
            })
    except Exception as e:
        return {"success": False, "message": f"读取图库失败: {e}", "files": []}

    files.sort(key=lambda x: x["mtime"], reverse=True)
    return {"success": True, "files": files, "total": len(files), "dir": upload_dir}


@router.post("/sizes")
async def image_sizes(payload: dict = Body(...)):
    """
    探一批图片的体积（字节）。为什么必须由后端来做：
    图床/别人的服务器**不会**给跨域图片加 CORS 头，浏览器里 `fetch(url, {method:'HEAD'})`
    拿不到 Content-Length，所以前端自己量不出来 —— 只能让服务器去问。

    返回 {"sizes": {"<url>": 字节数}}；探不到的 url 不会出现在结果里。
    """
    urls = payload.get("urls") or []
    result: dict = {}

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        for raw in urls[:50]:
            if not isinstance(raw, str):
                continue
            u = raw.strip()
            if not u:
                continue
            if u in _SIZE_CACHE:
                result[u] = _SIZE_CACHE[u]
                continue

            size = _local_size(u)          # 本地 /uploads/... 直接 stat
            if size is None and u.lower().startswith("http"):
                try:
                    r = await client.head(u)
                    cl = r.headers.get("content-length")
                    if cl and cl.isdigit() and int(cl) > 0:
                        size = int(cl)
                    else:
                        # 有些图床不给 HEAD 的 content-length → 用 Range 只要 1 个字节，
                        # 从 Content-Range: bytes 0-0/1234567 里读出总大小
                        r2 = await client.get(u, headers={"Range": "bytes=0-0"})
                        cr = r2.headers.get("content-range", "")
                        if "/" in cr and cr.split("/")[-1].isdigit():
                            size = int(cr.split("/")[-1])
                except Exception:
                    size = None

            if size:
                _SIZE_CACHE[u] = size
                result[u] = size

    return {"success": True, "sizes": result}


@router.post("/test")
async def test_picbed_connection(payload: dict = Body(...)):
    url = payload.get("url", "").strip().rstrip('/')
    token = payload.get("token", "").strip()

    if not url or not token:
        return {"success": False, "message": "图床 API 地址和 Token 不能为空"}

    test_endpoint = f"{url}/api/v1/profile"
    if not token.startswith("Bearer "):
        token = f"Bearer {token}"

    headers = {"Authorization": token, "Accept": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(test_endpoint, headers=headers)
            if response.status_code != 200:
                return {"success": False, "message": f"校验失败，服务器返回了 {response.status_code} 错误"}

            data = response.json()
            if data.get("status") is True:
                user_email = data.get("data", {}).get("email", "未知用户")
                return {"success": True, "message": f"连接成功！当前账户: {user_email}"}
            else:
                return {"success": False, "message": f"Token 无效: {data.get('message', '未知错误')}"}
    except Exception as e:
        return {"success": False, "message": f"网络异常: {str(e)}"}


# 👇 【全新追加】：真实的图床图片上传接口
@router.post("/upload")
async def upload_image(
        file: UploadFile = File(...),
        url: str = Form(...),
        token: str = Form(...)
):
    url = url.strip().rstrip('/')
    token = token.strip()

    if not token.startswith("Bearer "):
        token = f"Bearer {token}"

    upload_endpoint = f"{url}/api/v1/upload"
    headers = {
        "Authorization": token,
        "Accept": "application/json"
    }

    try:
        content = await file.read()
        # 封装为 httpx 支持的文件上传格式
        files = {'file': (file.filename, content, file.content_type)}

        # 上传图片可能较慢，将超时设置为 30 秒
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(upload_endpoint, headers=headers, files=files)

            if response.status_code != 200:
                return {"success": False, "message": f"上传失败，图床返回了 {response.status_code} 错误"}

            data = response.json()
            # 兼容 Lsky Pro 的返回格式
            if data.get("status") is True:
                img_url = data.get("data", {}).get("links", {}).get("url")
                return {"success": True, "message": "上传成功", "url": img_url}
            else:
                return {"success": False, "message": f"图床拒绝接收: {data.get('message', '未知')}"}
    except httpx.ReadTimeout:
        return {"success": False, "message": "图片上传超时，请检查网络或图片是否过大"}
    except Exception as e:
        return {"success": False, "message": f"服务器异常: {str(e)}"}
