@echo off
rem ============================================================
rem  cso —— 打开隧道脚本的文本界面（菜单）
rem  真正的脚本是同目录的 console.cmd，这里只负责转发一下。
rem  本文件是 GBK/ANSI 保存的（和 console.cmd 一致），别存成 UTF-8。
rem
rem  速查：
rem    cso      打开菜单（后面带参数会原样传给 console.cmd，例如 cso open）
rem    cono     直接开隧道
rem    conc     直接关隧道
rem    cons     查看隧道状态
rem    conk     设置免密登录
rem ============================================================
call "%~dp0console.cmd" %*
