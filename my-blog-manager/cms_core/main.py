import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass

import json
import os
import secrets
from pathlib import Path

from cms_core.api import music, config, picbed, drafts, moments
from cms_core.api import gallery, friends, projects
from cms_core.api import sync, deploy, resources, autosync, comments, tools


_BASE_DIR = Path(__file__).resolve().parent.parent
_KEY_FILE = _BASE_DIR / "manager_data" / ".admin_key"


def _load_or_create_key() -> str:
    env = (os.environ.get("CMS_ADMIN_KEY") or "").strip()
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
            os.chmod(_KEY_FILE, 0o600)
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
        if request.url.path.rstrip("/").endswith("/api/resources/watch"):
            return await call_next(request)

        provided = request.headers.get("x-admin-key") or request.query_params.get("key") or ""
        if provided != ADMIN_KEY:
            return JSONResponse(
                {"ok": False, "message": "缺少或错误的管理密钥（X-Admin-Key）"},
                status_code=401,
            )
    return await call_next(request)

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
app.include_router(tools.router, prefix="/api/tools", tags=["Tools"])

autosync.start()
