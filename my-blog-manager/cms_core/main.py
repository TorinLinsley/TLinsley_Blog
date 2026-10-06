import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Windows 的 cmd 默认按 GBK(cp936) 输出，日志里只要出现 emoji（👀 之类）就会抛
# UnicodeEncodeError 把后端进程直接打死，表现就是「控制台打不开、页面一直在重连」。
# 这里只放宽编码错误处理：中文照常显示，装不下的 emoji 变成 ?，不会再崩。
# Linux 上是 UTF-8，这行等于没影响。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass

import json
import os
import secrets
from pathlib import Path

# 引入所有 API 路由
from cms_core.api import music, config, picbed, drafts, moments
from cms_core.api import gallery, friends, projects
from cms_core.api import sync, deploy, resources, autosync, comments, tools

# ────────────────────────────────────────────────────────────────────────
# 🔑 管理密钥
#
# 为什么要有：这个后端能**直接改博客的文件**（文章、资源、项目、配置……），
# 但它原先**没有任何鉴权**，唯一的防线是「只绑定在 127.0.0.1」。
# 一旦博客前台出现 SSRF（例如 CVE-2026-64649 那类），攻击者就能打到本机
# 127.0.0.1:7646 直接改文件。加一把钥匙，把这条路堵上。
#
# 🔑 来源（按优先级）：
#   1. 环境变量 CMS_ADMIN_KEY
#   2. manager_data/.admin_key（没有就自动生成，权限 600）
# 钥匙会**同时写一份到 public/backend_config.json** 给控制台前端读
# （前端从那里读端口，顺手读走钥匙）。那个文件不在部署包里，是本机/服务器特有的。
#
# ⚠️ 老实说清它的边界：控制台前端和这个后端在**同一台机器**上，
#    所以能读 3010 静态文件的高保真 SSRF 仍可能拿到钥匙。它挡住的是
#    「盲打式 SSRF」和其他本机用户/进程 —— 属于纵深防御的一层，
#    不是万能药。真正的根治是修掉 SSRF 本身（升级 Next + nginx 固定 Host）。
# ────────────────────────────────────────────────────────────────────────

_BASE_DIR = Path(__file__).resolve().parent.parent      # my-blog-manager/
_KEY_FILE = _BASE_DIR / "manager_data" / ".admin_key"   # 不在 public/ 下，不会被当静态文件发出去


def _load_or_create_key() -> str:
    env = (os.environ.get("CMS_ADMIN_KEY") or "").strip()
    # 🚪 应急开关：CMS_ADMIN_KEY=off 就直接关掉鉴权（改回原样，不校验）。
    #    万一钥匙出问题、控制台进不去，设这个环境变量重启后端即可立刻恢复，
    #    不需要改代码、不需要回滚。
    if env.lower() in ("off", "0", "none", "disabled"):
        return ""
    if env:
        return env
    try:
        if _KEY_FILE.exists():
            key = _KEY_FILE.read_text(encoding="utf-8").strip()
            if key:
                return key
        key = secrets.token_urlsafe(32)
        _KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        _KEY_FILE.write_text(key, encoding="utf-8")
        try:
            os.chmod(_KEY_FILE, 0o600)          # Linux 上只有属主能读
        except Exception:
            pass
        return key
    except Exception:
        return ""


ADMIN_KEY = _load_or_create_key()


def _publish_key_to_frontend() -> None:
    """把钥匙写进 backend_config.json（保留里面已有的 api_port）。

    ⚠️ 必须写**两个**位置：
      · <项目>/public/backend_config.json                      —— 普通 next start 模式发的就是这里
      · <项目>/.next/standalone/public/backend_config.json      —— standalone 模式发的是这里
        （deploy/linux/start-console-web.sh 两个都写，说明服务器两种模式都可能出现；
          只写前者的话，服务器上浏览器永远拿不到钥匙 → 控制台全 401）
    """
    if not ADMIN_KEY:
        return
    targets = [
        _BASE_DIR / "public" / "backend_config.json",
        _BASE_DIR / ".next" / "standalone" / "public" / "backend_config.json",
    ]
    for cfg_path in targets:
        # standalone 那份只在目录已经存在时才写（没跑 standalone 就别凭空造目录）
        if cfg_path.parent.name == "public" and "standalone" in str(cfg_path) and not cfg_path.parent.exists():
            continue
        try:
            data = {}
            if cfg_path.exists():
                raw = cfg_path.read_text(encoding="utf-8").strip()
                if raw:
                    data = json.loads(raw)
            data["admin_key"] = ADMIN_KEY
            cfg_path.parent.mkdir(parents=True, exist_ok=True)
            cfg_path.write_text(json.dumps(data), encoding="utf-8")
        except Exception:
            pass


_publish_key_to_frontend()

app = FastAPI(title="TLinsleyBlog CMS Backend", version="1.0.0")

# 这些接口不需要钥匙：只返回"活着没"，零敏感信息，留着方便排查问题。
# 启动脚本、你自己的健康检查都可能用到它。
PUBLIC_PATHS = {"/api/status"}


@app.middleware("http")
async def require_admin_key(request: Request, call_next):
    """除少数零信息接口外，/api/* 一律要求 X-Admin-Key。

    ⚠️ 预检请求（OPTIONS）必须放行：浏览器发预检时不会带自定义头，
       拦掉的话所有跨域请求会在预检阶段就失败。
    """
    path = request.url.path
    if (
        ADMIN_KEY
        and request.method != "OPTIONS"
        and path.startswith("/api/")
        and path not in PUBLIC_PATHS
    ):
        if request.headers.get("x-admin-key") != ADMIN_KEY:
            return JSONResponse(
                {"ok": False, "message": "缺少或错误的管理密钥（X-Admin-Key）"},
                status_code=401,
            )
    return await call_next(request)

# 🌟 跨域：**只允许控制台自己**的来源（本机 / localhost，含 pywebview 与各种端口）。
#    原来写的是 ["*"] —— 等于互联网上任何一个网站都能读这个后端的响应，
#    而这个后端是能改文件的，不该那么开放。
#    ⚠️ 如果你以后要从局域网 IP 或内网穿透域名访问控制台，把这个正则换成
#       环境变量 CMS_ALLOW_ORIGIN_REGEX 覆盖即可。
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=os.environ.get(
        "CMS_ALLOW_ORIGIN_REGEX",
        r"^https?://(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$",
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status")
def get_status():
    return {"status": "online", "message": "中枢神经已连接"}


# 注册所有路由
app.include_router(music.router, prefix="/api/music", tags=["Music"])
app.include_router(config.router, prefix="/api/config", tags=["Config"])
app.include_router(picbed.router, prefix="/api/picbed", tags=["PicBed"])
app.include_router(drafts.router, prefix="/api/drafts", tags=["Drafts"])
app.include_router(gallery.router, prefix="/api/gallery", tags=["Gallery"])
app.include_router(friends.router, prefix="/api/friends", tags=["Friends"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(moments.router, prefix="/api/moments", tags=["Moments"])
app.include_router(sync.router, prefix="/api/sync", tags=["Sync"])
app.include_router(deploy.router, prefix="/api/deploy", tags=["Deploy"])
app.include_router(resources.router, prefix="/api/resources", tags=["Resources"])
app.include_router(comments.router, prefix="/api/comments", tags=["Comments"])
# 🧰 工具页：管理 <博客>/tools 下那些独立的小网页工具
app.include_router(tools.router, prefix="/api/tools", tags=["Tools"])

# 🌟 自动同步：控制台里改的东西（文章、说说、关于、配置……）会自动镜像到博客项目，
# 不用再手点「同步Blog」。启动时只记基线，不会开机覆盖博客。
autosync.start()
