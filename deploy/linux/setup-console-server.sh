#!/usr/bin/env bash
#
# 在**服务器**上装"星辉控制台"（前端 + 后端），让它直接管理服务器上的博客前台目录。
#
#   sudo bash setup-console-server.sh
#
# 前置：先跑过 setup-server.sh（Node 已装、前台在 /srv/www/tlblog）。
# 装完访问方式（控制台只监听 127.0.0.1，公网扫不到）：
#
#   在你自己的电脑上执行：
#     ssh -L 3010:127.0.0.1:3010 -L 7646:127.0.0.1:7646 <服务器用户>@<服务器IP>
#   然后浏览器打开：http://127.0.0.1:3010
#
# 内容改动会由控制台的 autosync 直接写进 /srv/www/tlblog，
# 前台是 force-dynamic（运行时读文件）→ 刷新即见，不用重新构建。
# 改了代码/样式/siteConfig.ts 才需要：
#   sudo bash /srv/www/rebuild-if-needed.sh tlblog

set -euo pipefail

APP_USER="${APP_USER:-blog}"
CONSOLE_DIR="${CONSOLE_DIR:-/srv/www/console}"
BLOG_DIR="${BLOG_DIR:-/srv/www/tlblog}"
API_PORT="${API_PORT:-7646}"
WEB_PORT="${WEB_PORT:-3010}"
HERE="$(cd "$(dirname "$0")" && pwd)"

log() { printf '\n==> %s\n' "$*"; }

[ -d "$BLOG_DIR" ] || echo "⚠️  还没看到博客前台目录 $BLOG_DIR（先跑 setup-server.sh）"

log "1/5 Python 依赖（控制台是网页模式，不需要任何桌面窗口依赖）"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3 python3-pip
if [ -f "$CONSOLE_DIR/requirements.txt" ]; then
  python3 -m pip install -r "$CONSOLE_DIR/requirements.txt" -i https://pypi.tuna.tsinghua.edu.cn/simple
else
  echo "    （还没看到 requirements.txt，等控制台代码传上来再跑一次本脚本）"
fi

log "2/5 目录与权限"
mkdir -p "$CONSOLE_DIR/public" "$CONSOLE_DIR/data"
chown -R "$APP_USER:$APP_USER" "$CONSOLE_DIR"
install -m 755 "$HERE/rebuild-console.sh" /srv/www/rebuild-console.sh

log "3/5 告诉控制台：博客前台就在这台机器的 $BLOG_DIR"
python3 - "$CONSOLE_DIR" "$BLOG_DIR" <<'PY'
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
print('  已写入', path)

# 前端靠这个文件知道后端端口（服务器上由 systemd 固定跑，直接写死）
with open(os.path.join(console, 'public', 'backend_config.json'), 'w', encoding='utf-8') as f:
    json.dump({'api_port': int(os.environ.get('API_PORT', '7646'))}, f)
print('  已写入 public/backend_config.json')
PY

log "4/5 构建前端（生产模式，比 next dev 省资源得多）"
cd "$CONSOLE_DIR"
sudo -u "$APP_USER" npm config set registry https://registry.npmmirror.com || true
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build

log "5/5 systemd 服务（都只监听 127.0.0.1）"
for unit in xhconsole-api xhconsole-web; do
  install -m 644 "$HERE/$unit.service" "/etc/systemd/system/$unit.service"
done
sed -i "s#__APP_USER__#${APP_USER}#g; s#__CONSOLE_DIR__#${CONSOLE_DIR}#g; s#__API_PORT__#${API_PORT}#g; s#__WEB_PORT__#${WEB_PORT}#g" \
  /etc/systemd/system/xhconsole-api.service /etc/systemd/system/xhconsole-web.service
systemctl daemon-reload
systemctl enable --now xhconsole-api xhconsole-web
systemctl --no-pager --lines=0 status xhconsole-api xhconsole-web || true

cat <<EOF

============================================================
控制台装好了（只监听 127.0.0.1，公网访问不到）。打开方式：

  1) 在你自己的电脑上开一条隧道（保持窗口别关）：
       ssh -L 3010:127.0.0.1:3010 -L 7646:127.0.0.1:7646 <服务器用户>@<服务器IP>

  2) 浏览器打开：
       http://127.0.0.1:3010

常用命令：
  sudo systemctl restart xhconsole-api xhconsole-web     # 重启控制台
  journalctl -u xhconsole-api -n 50 -f                   # 看后端日志
  journalctl -u xhconsole-web -n 50 -f                   # 看前端日志
  sudo bash /srv/www/rebuild-if-needed.sh tlblog        # 改了前台代码后重建

控制台目录: ${CONSOLE_DIR}
管的前台:   ${BLOG_DIR}   （内容改完刷新即见，不用重建）
EOF
