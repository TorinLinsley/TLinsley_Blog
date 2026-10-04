@echo off
chcp 65001 >nul 2>&1
setlocal
title TLinsleyBlog - 控制台
cd /d "%~dp0"

rem ================= 想换端口就改这两行 =================
set "API_PORT=7646"
set "WEB_PORT=3010"
rem =====================================================

set "CONSOLE=%~dp0my-blog-manager"

echo ==================================================
echo    TLinsleyBlog  控制台（网页模式）
echo    后端 API ：http://127.0.0.1:%API_PORT%
echo    控制台页面：http://127.0.0.1:%WEB_PORT%
echo ==================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 没检测到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)
where python >nul 2>&1
if errorlevel 1 (
  echo [错误] 没检测到 Python，请先安装：https://www.python.org/
  pause
  exit /b 1
)
if not exist "%CONSOLE%\cms_core\main.py" (
  echo [错误] 没找到 my-blog-manager\cms_core\main.py
  echo        这个脚本要放在项目根目录（和 TLBlog、my-blog-manager 同级）。
  pause
  exit /b 1
)

cd /d "%CONSOLE%"

if not exist "node_modules" (
  echo [依赖] 正在安装前端依赖（npm install）...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo [错误] 前端依赖安装失败，检查网络后重试。
    pause
    exit /b 1
  )
)

python -c "import fastapi, uvicorn" >nul 2>&1
if errorlevel 1 (
  echo [依赖] 正在安装 Python 依赖（pip install -r requirements.txt）...
  python -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [错误] Python 依赖安装失败，检查网络后重试。
    echo        国内网络可以改用镜像：
    echo        python -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    pause
    exit /b 1
  )
)

rem 前端靠这个文件知道后端在哪个端口
if not exist "public" mkdir "public"
> "public\backend_config.json" echo {"api_port": %API_PORT%}

echo [启动] 后端 API（新窗口）...
start "TLinsleyBlog 后端 API" cmd /k python -m uvicorn cms_core.main:app --host 127.0.0.1 --port %API_PORT%
timeout /t 3 /nobreak >nul

echo [启动] 控制台前端，浏览器会自动打开 http://127.0.0.1:%WEB_PORT%
echo [提示] 关掉这个窗口停前端；后端那个窗口也要一起关。
echo.
start "" http://127.0.0.1:%WEB_PORT%
call npm run dev -- -p %WEB_PORT%

echo.
echo [停止] 控制台前端已退出，记得把「TLinsleyBlog 后端 API」窗口也关掉。
pause
