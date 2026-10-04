from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 引入所有 API 路由
from cms_core.api import music, config, picbed, drafts, moments
from cms_core.api import gallery, friends, projects
from cms_core.api import sync, deploy, resources, autosync, comments, tools

app = FastAPI(title="TLinsleyBlog CMS Backend", version="1.0.0")

# 🌟 核心修复：添加跨域中间件，彻底解决 Failed to fetch 报错
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源请求
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有请求方法 (GET, POST 等)
    allow_headers=["*"],  # 允许所有请求头
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
