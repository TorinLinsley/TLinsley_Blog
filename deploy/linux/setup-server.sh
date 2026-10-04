#!/usr/bin/env bash
#
# 在**正式服务器**（Ubuntu 22.04，无桌面）上跑一次：把博客前台的运行环境装好。
#
#   sudo bash setup-server.sh
#
# 做完之后，你在虚拟机里执行 deploy/linux/upload-to-server.sh，文件就会 rsync 过来，
# 由 /srv/www/rebuild-if-needed.sh 判断"要不要重建"。
#
# 幂等：重复跑只会补缺。

set -euo pipefail

# 跑站点的用户：默认用"你 ssh 登录的那个用户"（云服务器常见 root 或 ubuntu），
# 这样 rsync 上传时权限天然对得上，不用再折腾属主。
APP_USER="${APP_USER:-${SUDO_USER:-blog}}"
WORK="${WORK:-/srv/www/tlblog}"      # 博客前台工作目录
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

# 把路径/用户写进 /etc/tlblog.env：以后跑重建脚本不用再带参数
cat > /etc/tlblog.env <<EOF
# 由 setup-server.sh 生成；rebuild-if-needed.sh 会自动读取
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
# 首次还没有代码，先别急着重启失败：有内容了就启
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
