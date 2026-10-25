


[CmdletBinding()]
param(
    [ValidateSet('blog', 'console')]
    [string]$Target = 'blog',

    [switch]$WithContent,

    [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'

if (-not $OutDir) {
    $shellFolders = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders'
    $OutDir = (Get-ItemProperty -Path $shellFolders -Name '{374DE290-123F-4565-9164-39C4925E467B}' -ErrorAction SilentlyContinue).'{374DE290-123F-4565-9164-39C4925E467B}'
    if (-not $OutDir) { $OutDir = Join-Path $env:USERPROFILE 'Downloads' }
}

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

if ($Target -eq 'blog') {
    $src  = Join-Path $Root 'TLBlog'
    $name = 'tlblog'
    $rebuild = 'bash /srv/www/rebuild-if-needed.sh tlblog'
} else {
    $src  = Join-Path $Root 'my-blog-manager'
    $name = 'console'
    $rebuild = 'bash /srv/www/rebuild-console.sh'
}

if (-not (Test-Path -LiteralPath $src)) {
    throw "找不到源码目录：$src"
}

$exDirs = @(
    (Join-Path $src 'node_modules'),
    (Join-Path $src '.next'),
    (Join-Path $src '.git'),
    (Join-Path $src '.idea'),
    (Join-Path $src '.vscode')
)
$exFiles = @('.code-hash', '.lock-hash', '*.log', 'npm-debug.log*', '.DS_Store', 'tsconfig.tsbuildinfo', '*.pyc')

if ($Target -eq 'console') {
    $exFiles += @('deploy_config.json', 'backend_config.json')
}

if (-not $WithContent) {
    $exDirs += @(
        (Join-Path $src 'posts'),
        (Join-Path $src 'chatters'),
        (Join-Path $src 'moments'),
        (Join-Path $src 'resources'),
        (Join-Path $src 'public\uploads'),
        (Join-Path $src 'tools')
    )
    if ($Target -eq 'console') {
        $exDirs += (Join-Path $src 'manager_data')
    }

    $exFiles += @(
        (Join-Path $src 'siteConfig.ts'),
        (Join-Path $src 'data\music-config.json'),
        (Join-Path $src 'data\comments-config.json'),
        (Join-Path $src 'data\albums.ts'),
        (Join-Path $src 'data\friends.ts'),
        (Join-Path $src 'data\projects.ts'),
        (Join-Path $src 'app\about\about.md')
    )
}

$stage = Join-Path $env:TEMP ('xhpack-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$stageRoot = Join-Path $stage $name
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

try {
    Write-Host ''
    Write-Host "==> 正在收集文件： $src" -ForegroundColor Cyan

    $rcArgs = @($src, $stageRoot, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1')
    $rcArgs += '/XD'
    $rcArgs += $exDirs
    $rcArgs += '/XF'
    $rcArgs += $exFiles

    & robocopy @rcArgs | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy 出错，退出码 $LASTEXITCODE" }

    if (-not (Test-Path -LiteralPath $OutDir)) {
        New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    }

    $old = Get-ChildItem -LiteralPath $OutDir -Filter ("{0}-pkg-*.tar.gz" -f $name) -File -ErrorAction SilentlyContinue
    if ($old) {
        foreach ($f in $old) { Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue }
        Write-Host ("==> 已清掉 {0} 个旧包：{1}" -f $old.Count, (($old | ForEach-Object { $_.Name }) -join ', ')) -ForegroundColor DarkGray
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
    $out = Join-Path $OutDir ("{0}-pkg-{1}.tar.gz" -f $name, $stamp)
    if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }

    Write-Host "==> 正在打包 ..." -ForegroundColor Cyan
    & tar -czf $out -C $stage $name
    if ($LASTEXITCODE -ne 0) { throw "tar 打包失败，退出码 $LASTEXITCODE" }

    $sizeMB = [math]::Round((Get-Item -LiteralPath $out).Length / 1MB, 2)
    $files  = (Get-ChildItem -LiteralPath $stageRoot -Recurse -File).Count

    $contentNote = '只含代码（已排除 文章 / 说说 / 资源 / 图片，以及 node_modules、.next）'
    if ($WithContent) { $contentNote = '包含内容（文章 / 说说 / 资源 / 图片）' }

    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host ' 打包完成' -ForegroundColor Green
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host ("  文件： {0}" -f $out)
    Write-Host ("  大小： {0} MB   （{1} 个文件）" -f $sizeMB, $files)
    Write-Host ("  内容： {0}" -f $contentNote)
    Write-Host ''
    Write-Host ' 下一步：' -ForegroundColor Yellow
    Write-Host '   1) 用 WinSCP 把这个 .tar.gz 传到服务器（记得用二进制模式），放到 /root/ 下'
    Write-Host '   2) 服务器上粘这一条（已登录 root，不用 sudo）：'
    Write-Host ''
    if ($name -eq 'console') {
        Write-Host ("   tar -xzf /root/{0} -C /srv/www && chown -R blog:blog /srv/www/console && rm -rf /srv/www/console/.next && {1}" -f (Split-Path $out -Leaf), $rebuild) -ForegroundColor White
    } else {
        Write-Host ("   tar -xzf /root/{0} -C /srv/www && chown -R blog:blog /srv/www/{1} && {2}" -f (Split-Path $out -Leaf), $name, $rebuild) -ForegroundColor White
    }
    Write-Host ''
    Write-Host ("   3) 控制台页面 Ctrl+F5 硬刷一次（丢掉旧的前端 chunk）") -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $stage) {
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
}