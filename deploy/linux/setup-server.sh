#!/usr/bin/env bash

set -euo pipefail

APP_USER="${APP_USER:-${SUDO_USER:-blog}}"
WORK="${WORK:-/srv/www/tlblog}"
PORT="${PORT:-3000}"
SERVICE="${SERVICE:-tlblog}"
NODE_MAJOR="${NODE_MAJOR:-22}"
HERE="$(cd "$(dirname "$0")" && pwd)"

log() { printf '\n==> %s\n' "$*"; }

log "1/5 系统依赖（nginx / git / rsync / Node ${NODE_MAJOR}）"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git rsync ca-certificates nginx

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v\([0-9]*\).*/\1/')" -lt 20 ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v && npm -v

log "2/5 用户与工作目录"
if [ "$APP_USER" != "root" ]; then
  id -u "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
  mkdir -p "/home/$APP_USER/.ssh"
  chown -R "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh"
  chmod 700 "/home/$APP_USER/.ssh"
else
  echo "    以 root 跑站点（服务器上只有一个用户时这样最省事）"
fi
mkdir -p "$WORK"
chown -R "$APP_USER:$APP_USER" "$WORK"

cat > /etc/tlblog.env <<EOF
APP_USER=${APP_USER}
WORK=${WORK}
SERVICE=${SERVICE}
EOF
chmod 644 /etc/tlblog.env
echo "    已写入 /etc/tlblog.env（APP_USER=$APP_USER, WORK=$WORK）"
echo "    SSH 公钥要放到 /home/$APP_USER/.ssh/authorized_keys（以 root 跑就免了）"

log "3/5 安装重建脚本"
install -m 755 "$HERE/rebuild-if-needed.sh" /srv/www/rebuild-if-needed.sh

log "4/5 systemd 服务"
install -m 644 "$HERE/tlblog.service" "/etc/systemd/system/${SERVICE}.service"
sed -i "s#__APP_USER__#${APP_USER}#g; s#__WORK__#${WORK}#g; s#__PORT__#${PORT}#g" "/etc/systemd/system/${SERVICE}.service"
systemctl daemon-reload
systemctl enable "$SERVICE"
if [ -f "$WORK/package.json" ]; then
  systemctl restart "$SERVICE"
fi
systemctl --no-pager --lines=0 status "$SERVICE" || true

log "5/5 nginx"
install -m 644 "$HERE/nginx-tlblog.conf" /etc/nginx/sites-available/tlblog.conf
ln -sf /etc/nginx/sites-available/tlblog.conf /etc/nginx/sites-enabled/tlblog.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

cat <<EOF

============================================================
服务器这边准备好了。接下来：

1) 安全组 / 防火墙放行 80（和 443）；
2) nginx 配置里的 server_name 换成你的域名，然后配 HTTPS（香港服务器不用备案，直接签就行）：
     sudo DOMAIN=blog.torinlinsley.top EMAIL=你的邮箱 bash ~/linux/setup-https.sh
   （想连裸域名一起签：再加 DOMAIN2=torinlinsley.top；脚本会自动把 http 301 跳到 https）
3) 回到**虚拟机**，填好 deploy/linux/server.env，然后：
     bash deploy/linux/upload-to-server.sh

工作目录: ${WORK}
服务名:   ${SERVICE}（监听 127.0.0.1:${PORT}，由 nginx 对外）
重建脚本: /srv/www/rebuild-if-needed.sh
EOF