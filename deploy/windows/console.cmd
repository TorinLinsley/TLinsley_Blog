@echo off
rem ============================================================
rem  编码说明：本文件是 **GBK/ANSI** 保存的，和下面的 chcp 936 配套，
rem  cmd 解析里面的中文才正常。若存成 UTF-8，cmd 解析会错位，出现
rem  "'xxx' is not recognized as an internal or external command"。
rem  只有真正 ssh 的那一小段临时切到 65001（服务器 Ubuntu 是 UTF-8），
rem  ssh 结束立刻切回 936 —— 所以连接过程中、断开之后中文都不乱码。
rem ============================================================
rem  deploy\windows 这个目录已经在【系统 PATH】里，所以：
rem    - 任意目录都能直接敲命令，不用先 cd 过来；
rem    - 普通 cmd 和【管理员 cmd】都能用（系统 PATH 对所有账户生效）。
rem
rem  用法（命令名就是文件名）：
rem    cso                打开菜单（文本界面）
rem    cono               直接开隧道（等价 cso open）
rem    conc               直接关隧道
rem    cons               看隧道状态
rem    conk               设置免密登录
rem  老写法同样能用： console / console open / console close / console status / console key
rem  想再换个名字：加一个同目录的 xxx.cmd，里面 call 本文件即可（这些短名都是这么来的）。
rem
rem  注意：本机 PATH 里 c:\windows\syswow64 排在 c:\windows\system32 前面，
rem  导致 where / cmd 会命中 32 位版本（32 位进程看不见 System32\OpenSSH，
rem  where ssh 会误报"找不到"）。所以这里**不要用 where 判断 ssh**，
rem  改用下面的绝对路径判断；而且判断只是为了挑个明确路径，找不到也照样继续跑。
rem ============================================================
chcp 936 >nul
setlocal
title TL控制台 - SSH 隧道
rem 固定到脚本自己所在的目录：这样在任意目录（含管理员 cmd 默认的 C:\Windows\System32）里跑都没差别
cd /d "%~dp0"
rem ⚠️ 把这行改成你自己的服务器：把下面 root@ 后面换成你的服务器 IP
set "SERVER=root@你的服务器IP"
rem 真实地址放同目录的 server.env（那个文件不进 git），有就用它覆盖上面的占位符
if exist "%~dp0server.env" for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0server.env") do if /i "%%a"=="SERVER" set "SERVER=%%b"
set "PUBKEY=%USERPROFILE%\.ssh\id_ed25519.pub"
set "PORTS=-L 3010:127.0.0.1:3010 -L 7646:127.0.0.1:7646"

rem ── 认准 ssh.exe 走哪个（不依赖 PATH，也不用 where）──
rem    64 位窗口：System32\OpenSSH\ssh.exe 直接能看见；
rem    32 位窗口：System32 会被重定向到 SysWOW64，得用 Sysnative 才是真 System32；
rem    两个都没有（比如 ssh 装在别处）：退回 PATH 里的 ssh，让 cmd 自己去解析。
set "SSH=%SystemRoot%\System32\OpenSSH\ssh.exe"
if exist "%SSH%" goto :ssh_ready
set "SSH=%SystemRoot%\Sysnative\OpenSSH\ssh.exe"
if exist "%SSH%" goto :ssh_ready
set "SSH=ssh"
:ssh_ready

rem ── 带参数就直接干活、干完退出（不进菜单）；不带参数就走下面的菜单 ──
if /i "%~1"=="open"   (set "XH_TUNNEL_ONESHOT=1" & goto :open)
if /i "%~1"=="close"  (set "XH_TUNNEL_ONESHOT=1" & goto :close)
if /i "%~1"=="status" (set "XH_TUNNEL_ONESHOT=1" & goto :status)
if /i "%~1"=="key"    (set "XH_TUNNEL_ONESHOT=1" & goto :key)

:menu
cls
echo ================================================
echo    TL控制台 - SSH 隧道
echo ================================================
echo.
echo    [1] 打开隧道（本窗口不要关，关了就进不了控制台）
echo    [2] 关闭隧道
echo    [3] 查看隧道状态
echo    [4] 设置免密登录（只做一次，以后不用再输密码）
echo    [0] 退出
echo.
echo    （也可以直接敲： cons open / cons close / cons status / cons key）
echo.
choice /c 12340 /n /m "请输入数字后回车: "
if errorlevel 5 goto :bye
if errorlevel 4 goto :key
if errorlevel 3 goto :status
if errorlevel 2 goto :close
if errorlevel 1 goto :open

:open
cls
echo 正在连接 %SERVER% ...
echo.
echo   * 提示 password 时屏幕上不会显示任何字符，输完直接回车。
echo   * 连上后本窗口会变成服务器命令行，说明隧道已经通了。
echo   * 浏览器会自动打开 http://127.0.0.1:3010
echo   * 想断隧道：在本窗口输入 exit 回车，或者回到本脚本选 [2]。
echo   * 连不上会在 15 秒内自己退回来（跨境线路偶尔卡一下，重开即可）。
echo.
if "%SSH%"=="ssh" (
  echo [提示] 没在标准位置找到 ssh.exe，下面直接拿 PATH 里的 ssh 试一次。
  echo        要是下面报"不是内部或外部命令"，装一下 OpenSSH 客户端，或把 C:\Windows\System32\OpenSSH 加进 PATH。
  echo.
)
rem 注意：浏览器交给 explorer.exe 去开，不要用 start。
rem   管理员 cmd 里 start 会让浏览器以管理员身份启动，Chrome/Edge 会拒绝或开不出来；
rem   explorer 等于交给当前登录用户的桌面去开，普通 cmd 和管理员 cmd 都能正常弹浏览器。
start "" /min cmd /c "timeout /t 6 >nul && explorer.exe http://127.0.0.1:3010"
chcp 65001 >nul
"%SSH%" -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes %PORTS% %SERVER%
chcp 936 >nul
echo.
echo [隧道已断开]
echo.
if defined XH_TUNNEL_ONESHOT goto :bye
pause
goto :menu

:close
cls
echo 正在关闭到 %SERVER% 的隧道 ...
powershell -NoProfile -Command "$p=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ssh.exe' -and $_.CommandLine -like '*%SERVER%*' }; if($p){ $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('  已关闭 PID ' + $_.ProcessId) } } else { Write-Host '  当前没有连到服务器的隧道。' }"
echo.
if defined XH_TUNNEL_ONESHOT goto :bye
pause
goto :menu

:status
cls
echo 本地监听端口（3010 和 7646 都有，才说明隧道开着）:
echo.
netstat -ano | findstr /C:"127.0.0.1:3010" /C:"127.0.0.1:7646"
echo.
echo （上面没有输出 = 隧道没开；有输出但浏览器打不开 = 服务器上的服务停了）
echo.
if defined XH_TUNNEL_ONESHOT goto :bye
pause
goto :menu

:key
cls
echo 设置免密登录（只需要做一次）:
echo.
echo   1) 下面这条命令会把你的公钥追加到服务器的 authorized_keys
echo   2) 过程中要输一次 root 密码
echo   3) 成功后，选 [1] 开隧道就不用再输密码了
echo.
rem 注意：管理员 cmd 如果是以【别的账户】（比如内置 Administrator）打开的，
rem   %USERPROFILE% 就不是你日常那个目录，这里会找不到公钥，回普通 cmd 里做这一步。
if not exist "%PUBKEY%" (
  echo [找不到公钥] %PUBKEY%
  echo.
  echo   这个窗口的用户目录是： %USERPROFILE%
  echo   如果你是在以其它管理员身份运行的 cmd 里，请换回你日常账户的普通 cmd 再执行一次。
  echo   只想要隧道、不想配免密也行：选 [1] 时手动输 root 密码一样能用。
  echo.
  if defined XH_TUNNEL_ONESHOT goto :bye
  pause
  goto :menu
)
pause
chcp 65001 >nul
"%SSH%" -o ConnectTimeout=15 %SERVER% "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && echo >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo KEY_OK" < "%PUBKEY%"
chcp 936 >nul
echo.
if defined XH_TUNNEL_ONESHOT goto :bye
pause
goto :menu

:bye
endlocal
exit /b 0
