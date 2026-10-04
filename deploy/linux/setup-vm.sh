#!/usr/bin/env bash
#
# 在 Ubuntu 22.04「桌面版」虚拟机上，一键把控制台 + 博客前台的开发环境装好。
#
#   bash setup-vm.sh                 # 默认项目根目录 ~/TLinsleyBlog
#   bash setup-vm.sh /path/to/root   # 项目在别处时传进来
#
# 装完：桌面会有「TLinsleyBlog 控制台」图标，双击就在浏览器里打开控制台（网页模式）；
#       博客前台用控制台里的「预览」/或者在 XHBlogs 目录 npm run dev 起来看。
#
# 幂等：重复跑只会补缺。

set -euo pipefail

ROOT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"   # 默认就用这个脚本所在仓库的根目录
NODE_MAJOR="${NODE_MAJOR:-22}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CONSOLE="$ROOT/my-blog-manager"
BLOG="$ROOT/XHBlogs"

log() { printf '\n==> %s\n' "$*"; }

[ -d "$CONSOLE" ] && [ -d "$BLOG" ] || {
  echo "❌ 在 $ROOT 下没同时找到 my-blog-manager 和 XHBlogs，请把项目根目录作为参数传进来" >&2
  exit 1
}

log "1/6 系统依赖"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
# xclip 给控制台的「复制」按钮用（控制台是网页模式，不再需要 WebKitGTK 那套窗口依赖）
sudo apt-get install -y \
  curl git rsync ca-certificates \
  python3-pip \
  xclip

log "2/6 Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v\([0-9]*\).*/\1/')" -lt 20 ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v && npm -v

log "3/6 Python 依赖（走清华源更快）"
python3 -m pip install --user -r "$CONSOLE/requirements.txt" -i https://pypi.tuna.tsinghua.edu.cn/simple
python3 - <<'PY'
import importlib, sys
for m in ('fastapi', 'uvicorn', 'markdown', 'markdownify', 'yaml', 'httpx'):
    try:
        importlib.import_module(m)
    except Exception as e:
        print(f'  ⚠️ {m} 导入失败：{e}')
PY

log "4/6 前端依赖（两个项目都装，走 npmmirror）"
npm config set registry https://registry.npmmirror.com
( cd "$CONSOLE" && npm ci )
( cd "$BLOG" && npm ci )

log "5/6 把控制台的 blogPath 指到这台机器上的博客目录"
python3 - "$CONSOLE" "$BLOG" <<'PY'
import json, os, sys
console, blog = sys.argv[1], sys.argv[2]
path = os.path.join(console, 'data', 'deploy_config.json')
cfg = {}
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        cfg = json.load(f)
cfg.setdefault('staticBranch', 'gh-pages')
cfg.setdefault('sourceBranch', 'main')
cfg['blogPath'] = blog
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, 'w', encoding='utf-8') as f:
    json.dump(cfg, f, ensure_ascii=False, indent=2)
print('  已写入', path, '->', blog)
PY

log "6/6 桌面图标（双击起控制台）"
chmod +x "$HERE/start-console.sh" "$ROOT/Start-Console.sh" "$ROOT/Start-Blog.sh" 2>/dev/null || true

DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$DESKTOP_DIR" ]; then
  cat > "$DESKTOP_DIR/TLinsleyBlog 控制台.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=TLinsleyBlog 控制台
Comment=博客管理控制台（浏览器网页模式）
Exec=bash $HERE/start-console.sh
Terminal=true
Icon=utilities-terminal
Categories=Development;
EOF
  chmod +x "$DESKTOP_DIR/TLinsleyBlog 控制台.desktop"
  echo "  已放桌面图标：$DESKTOP_DIR/TLinsleyBlog 控制台.desktop"
fi

cat <<EOF

============================================================
装好了。日常这样用：

  # 起控制台（浏览器会自动打开 http://127.0.0.1:3010）
  bash $HERE/start-console.sh

  # 只想起博客前台开发服务器（一般用不着，控制台里的预览就够）
  cd $BLOG && npm run dev

改完内容/代码、确认没问题之后，传到正式服务器：

  1) 先把这台虚拟机的公钥放到服务器上（只需一次）：
       ssh-copy-id -i ~/.ssh/id_ed25519.pub <服务器用户>@<服务器地址>
  2) 填好 deploy/linux/server.env（照着 server.env.example 复制）
  3) 执行：
       bash $HERE/upload-to-server.sh

项目根目录: $ROOT
EOF
