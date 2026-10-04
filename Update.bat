@echo off
chcp 936 >nul 2>&1
setlocal
title TLinsleyBlog - 更新到最新版
cd /d "%~dp0"

echo ==================================================
echo    TLinsleyBlog  更新到最新版（无损）
echo.
echo    - 文章 / 说说 / 资源 / 工具 / 图片、站点配置、
echo      data/*.ts、本机配置 —— 一律**不覆盖** √
echo    - 你没改过的代码：直接用新版覆盖
echo      （覆盖前的旧文件会备份到 .update-backup-* 里 √）
echo    - 你自己改过的代码：能自动三方合并就合并；
echo      撞在同一处会保留你的版本，另存 .merge / .new 给你挑 √
echo.
echo    只想先看看这次会改什么（不真改）：
echo        Update.bat --dry-run
echo ==================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 没检测到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)

node "%~dp0scripts\update.mjs" %*
set "CODE=%errorlevel%"

echo.
if not "%CODE%"=="0" (
  echo [注意] 更新脚本退出码是 %CODE% —— 上面有报错就往上翻，或者装个 git 再来一次 √
) else (
  echo [提示] 前台 / 控制台的代码有变化的话，重新跑 Start-Blog / Start-Console 即可 √
)
pause
