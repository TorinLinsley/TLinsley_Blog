<#
  把 Windows 上的项目打包，准备拷进 Ubuntu 虚拟机（只需要做一次）。

  用法（在 PowerShell 里）：
    powershell -ExecutionPolicy Bypass -File pack-project.ps1
    powershell -ExecutionPolicy Bypass -File pack-project.ps1 -SkipUploads   # 不带 public/uploads 的图片
    powershell -ExecutionPolicy Bypass -File pack-project.ps1 -Out D:\xh.tgz

  打包内容：XHBlogs / my-blog-manager / deploy 三个目录，
  自动排除 node_modules、.next、.git（这些在虚拟机里自己装/自己生成，传了又慢又容易出问题）。
#>
param(
  [string]$Source = '',
  [string]$Out = '',
  [switch]$SkipUploads
)

$ErrorActionPreference = 'Stop'

# 默认打包「项目根目录」（脚本在 deploy\windows\ 里，往上两层就是根）
if (-not $Source) { $Source = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
if (-not $Out)    { $Out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'TLinsleyBlog.tar.gz' }

$tar = Join-Path $env:SystemRoot 'System32\tar.exe'
if (-not (Test-Path $tar)) { throw "找不到 tar.exe（Windows 10 1803+ 自带）" }
if (-not (Test-Path $Source)) { throw "源目录不存在: $Source" }

$outDir = Split-Path $Out -Parent
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$excludes = @('--exclude=node_modules', '--exclude=.next', '--exclude=.git', '--exclude=.code-hash', '--exclude=.idea')
if ($SkipUploads) { $excludes += '--exclude=public/uploads' }

Write-Host "==> 打包目录: $Source"
Write-Host "==> 排除: $($excludes -join ' ')"

if (Test-Path $Out) { Remove-Item $Out -Force }
& $tar -czf $Out -C $Source @excludes XHBlogs my-blog-manager deploy

$size = (Get-Item $Out).Length
Write-Host ("==> 已生成: {0}  ({1:N1} MB)" -f $Out, ($size / 1MB))

# 顺手把里面的文件数报一下，确认没把 node_modules 打进去
$count = (& $tar -tzf $Out | Measure-Object -Line).Lines
$bad = (& $tar -tzf $Out | Select-String -Pattern 'node_modules|/\.next/|/\.git/' | Measure-Object -Line).Lines
Write-Host "==> 包内条目: $count，其中 node_modules/.next/.git 条目: $bad"
if ($bad -gt 0) { Write-Warning "包里混进了不该有的目录，检查一下排除参数" }

Write-Host @"

下一步二选一：

【A. 拖进虚拟机（最省事）】
  把这个文件拖到虚拟机的桌面（或用 VMware/VirtualBox 的共享文件夹），然后在虚拟机里：
    mkdir -p ~/www/TLinsleyBlog
    tar -xzf ~/桌面/$(Split-Path $Out -Leaf) -C ~/www/TLinsleyBlog
    cd ~/www/TLinsleyBlog/deploy/linux && bash setup-vm.sh

【B. 直接推到虚拟机（虚拟机里先装 sshd 并查 IP）】
  虚拟机里：
    sudo apt update && sudo apt install -y openssh-server
    hostname -I
  然后回到 Windows 执行：
    scp "$Out" 你的虚拟机用户名@虚拟机IP:~/
  虚拟机里：
    mkdir -p ~/www/TLinsleyBlog
    tar -xzf ~/$(Split-Path $Out -Leaf) -C ~/www/TLinsleyBlog
    cd ~/www/TLinsleyBlog/deploy/linux && bash setup-vm.sh

（如果 Windows 连不上虚拟机的 IP，多半是虚拟机网卡用了 NAT —— 把网卡改成「桥接 / Bridged」再试，或者走 A 方案。）
"@
