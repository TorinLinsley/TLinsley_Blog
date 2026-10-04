@echo off
chcp 65001 >nul 2>&1
setlocal
title TLinsleyBlog - 更新到最新版
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 没检测到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)

rem 想只看会改哪些文件，先跑： Update.bat --dry-run
node "%~dp0scripts\update.mjs" %*

echo.
pause
