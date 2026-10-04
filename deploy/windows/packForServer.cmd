@echo off
chcp 936 >nul
setlocal
title 打包给服务器
set "PS=%~dp0pack-for-server.ps1"

:menu
cls
echo ================================================
echo    打包给服务器  （输出到你的「下载」文件夹）
echo ================================================
echo.
echo    [1] 打包博客前台（只含代码，日常用这个）
echo    [2] 打包控制台（只含代码）
echo    [3] 打包博客前台（连文章/图片一起，首次部署用）
echo    [0] 退出
echo.
choice /c 1230 /n /m "请输入数字后回车: "
if errorlevel 4 goto :bye
if errorlevel 3 goto :pkg3
if errorlevel 2 goto :pkg2
if errorlevel 1 goto :pkg1

:pkg1
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%"
goto :done

:pkg2
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%" -Target console
goto :done

:pkg3
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%" -WithContent
goto :done

:done
echo.
pause
goto :menu

:bye
endlocal
exit /b 0
