#!/usr/bin/env bash
#
# 给博客前台配 HTTPS（Let's Encrypt），并且把 http 永久跳到 https。
# 香港服务器不用备案，直接用就行。
#
# 用法：
#   sudo DOMAIN=blog.torinlinsley.top EMAIL=you@example.com bash setup-https.sh
#   # 想同时给裸域名也签：sudo DOMAIN=blog.torinlinsley.top DOMAIN2=torinlinsley.top EMAIL=... bash setup-https.sh
#
# 前提：
#   ① 域名的 A 记录已经指向这台服务器的公网 IP（本脚本会帮你核对）
#   ② 安全组 / 防火墙放行 80 和 443
#   ③ nginx 已经在跑、且 server_name 是你的域名（本脚本会自动改好）
#
# 幂等：重复跑会复用已有证书（certbot 自己判断续期）。

set -euo pipefail

DOMAIN="${DOMAIN:?用法: sudo DOMAIN=你的域名 EMAIL=你的邮箱 bash setup-https.sh}"
DOMAIN2="${DOMAIN2:-}"
EMAIL="${EMAIL:?还要给一个邮箱 EMAIL=you@example.com（证书到期提醒用）}"
CONF="${CONF:-/etc/nginx/sites-available/tlblog.conf}"
STAGING="${STAGING:-0}"

log() { printf '\n==> %s\n' "$*"; }

log "1/5 装 certbot"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y certbot python3-certbot-nginx dnsutils

log "2/5 核对域名解析"
MYIP="$(curl -fsS --max-time 8 https://api.ipify.org || echo '')"
echo "    本机公网 IP: ${MYIP:-取不到}"
for d in "$DOMAIN" ${DOMAIN2:+"$DOMAIN2"}; do
  ip="$(dig +short A "$d" | tail -n1)"
  echo "    $d -> ${ip:-解析不到}"
  if [ -n "$MYIP" ] && [ -n "$ip" ] && [ "$ip" != "$MYIP" ]; then
    echo "    ⚠️  $d 解析到的不是本机 IP，签证书会失败 —— 先去域名后台把 A 记录改到 $MYIP，等生效再跑"
  fi
done

log "3/5 把 nginx 的 server_name 改成域名"
if [ -f "$CONF" ]; then
  sed -i "s/^\( *server_name \).*;/\1${DOMAIN}${DOMAIN2:+ $DOMAIN2};/" "$CONF"
  grep -n 'server_name' "$CONF" || true
  nginx -t && systemctl reload nginx
else
  echo "    ⚠️ 没找到 $CONF（先跑 setup-server.sh）"
fi

log "4/5 申请证书 + 自动把 http 跳转到 https（--redirect）"
CERTBOT_ARGS=(--nginx --non-interactive --agree-tos -m "$EMAIL" --redirect
              -d "$DOMAIN")
[ -n "$DOMAIN2" ] && CERTBOT_ARGS+=(-d "$DOMAIN2")
[ "$STAGING" = "1" ] && CERTBOT_ARGS+=(--staging)
certbot "${CERTBOT_ARGS[@]}"

log "5/5 检查结果"
echo "--- http 应该 301 到 https ---"
curl -sI "http://$DOMAIN" | head -n3 || true
echo "--- https 应该是 200 ---"
curl -sI "https://$DOMAIN" | head -n3 || true
echo "--- 自动续期定时器 ---"
systemctl list-timers 2>/dev/null | grep -i certbot || echo "（没看到 certbot timer，手动续期：sudo certbot renew）"

cat <<EOF

============================================================
HTTPS 配好了：https://$DOMAIN  （http 会自动 301 跳过去）

常用命令：
  sudo certbot renew --dry-run              # 演练一次续期（不会真续）
  sudo certbot certificates                 # 看证书有效期
  sudo systemctl reload nginx               # 改完 nginx 配置重载

想再打开 HSTS（浏览器强制只用 https，注意下面这条）：
  在 $CONF 的 server 块里加：
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  ⚠️ 一旦下发，浏览器一年内都会强制 https（连子域名也要有证书），确认稳定再用。
EOF
