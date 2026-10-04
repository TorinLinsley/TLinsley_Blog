@echo off
rem cons —— 查看隧道状态（等价于 console.cmd status）
rem 注意：打开菜单的是 cso；cons 现在是"看状态"。
rem 兼容旧习惯：cons 后面带了参数就按参数走（例如 cons open = 开隧道）。
if "%~1"=="" (call "%~dp0console.cmd" status) else (call "%~dp0console.cmd" %*)
