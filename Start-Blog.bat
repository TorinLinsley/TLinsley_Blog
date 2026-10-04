@echo off
chcp 936 >nul 2>&1
setlocal
title TLinsleyBlog - 前台博客
cd /d "%~dp0"

rem ==================== 想换端口就改这一行 ====================
set "PORT=3000"
rem ==========================================================

set "BLOG=%~dp0TLBlog"

echo ==================================================
echo    TLinsleyBlog  前台博客（Next.js 生产模式）
echo    目录：%BLOG%
echo    地址：http://localhost:%PORT%
echo ==================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 没检测到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)
if not exist "%BLOG%\package.json" (
  echo [错误] 没找到 TLBlog\package.json
  echo        这个脚本要放在项目根目录（和 TLBlog、my-blog-manager 同级）。
  pause
  exit /b 1
)

cd /d "%BLOG%"

if not exist "node_modules" (
  echo [依赖] 首次运行，正在 npm install，请稍等...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo [错误] 依赖安装失败，检查网络后重试。
    pause
    exit /b 1
  )
)

echo [指纹] 检查代码有没有变化...
set "NEWHASH="
for /f "delims=" %%h in ('node "%~dp0scripts\code-hash.mjs" "%BLOG%"') do set "NEWHASH=%%h"
set "OLDHASH="
if exist ".code-hash" set /p OLDHASH=<".code-hash"

set "NEEDBUILD=0"
if not exist ".next\BUILD_ID" set "NEEDBUILD=1"
if not "%NEWHASH%"=="%OLDHASH%" set "NEEDBUILD=1"

if "%NEEDBUILD%"=="1" (
  echo [构建] 代码/配置有变化，重新构建（第一次约 1-3 分钟）...
  if exist ".next" rmdir /s /q ".next"
  call npm run build
  if errorlevel 1 (
    echo [错误] 构建失败，往上翻看报错信息。
    pause
    exit /b 1
  )
  set /p "=%NEWHASH%" <nul > ".code-hash"
  echo [完成] 构建好了。
) else (
  echo [跳过] 代码没变化，直接用上次的构建产物。
)

echo.
echo [启动] 浏览器会自动打开 http://localhost:%PORT%
echo [提示] 关掉这个窗口即可停止博客。
echo.
start "" http://localhost:%PORT%
call npm run start -- -p %PORT%

echo.
echo [停止] 博客已退出。
pause
