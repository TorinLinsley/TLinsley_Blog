@echo off
chcp 936 >nul 2>&1
setlocal
title TLinsleyBlog - 控制台
cd /d "%~dp0"

rem ====== 想换端口就改这两行（也可以先 set API_PORT=7647 临时覆盖）======
if not defined API_PORT set "API_PORT=7646"
if not defined WEB_PORT set "WEB_PORT=3010"
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

rem 端口被占住的话别硬起：最常见是 SSH 隧道还开着（它把 3010/7646 转到服务器了），
rem 那种情况下前端连到的是服务器上的控制台、本地后端根本起不来，页面就没法用。
set "TLB_PORTS=%TEMP%\tlblog_ports.tmp"
netstat -ano > "%TLB_PORTS%" 2>nul
for %%P in (%API_PORT% %WEB_PORT%) do (
  findstr /c:":%%P " "%TLB_PORTS%" | findstr /i "LISTENING" >nul
  if not errorlevel 1 (
    echo [错误] 端口 %%P 已经被占用了，先关掉占用它的程序再运行。
    echo        看是谁占的：netstat -ano ^| findstr ":%%P"
    echo        常见原因：1. 上次的控制台/后端窗口还开着   2. SSH 隧道把 %API_PORT%/%WEB_PORT% 转到服务器了
    del "%TLB_PORTS%" >nul 2>&1
    pause
    exit /b 1
  )
)
del "%TLB_PORTS%" >nul 2>&1

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

rem .next 里如果躺着上一次「打包构建」的产物，dev 会跟它打架：Turbopack 反复 panic,
rem 浏览器上的表现就是「页面一直自动刷新、根本没法用」。检测到就先删掉，让 dev 自己重建。
if exist ".next\BUILD_ID" (
  echo [清理] .next 里是旧的构建产物，先删掉再启动（否则页面会一直自动刷新）...
  rmdir /s /q ".next"
)

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
