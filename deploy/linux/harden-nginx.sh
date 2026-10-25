#!/usr/bin/env bash
set -euo pipefail

CONF_DIR=/etc/nginx
SITE=00-default-deny
AVAIL="$CONF_DIR/sites-available/$SITE.conf"
ENABLED="$CONF_DIR/sites-enabled/$SITE.conf"
SNIP_DIR="$CONF_DIR/snippets"
CRT="$SNIP_DIR/self-signed.crt"
KEY="$SNIP_DIR/self-signed.key"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/root/nginx-backup-$STAMP"
SITE_URL="${SITE_URL:-https://blog.torinlinsley.top/}"
FAKE_HOST="${FAKE_HOST:-pcss.cc}"

[ "$(id -u)" = "0" ] || { echo "请用 root 跑：sudo bash $0"; exit 1; }

if [ "${1:-}" = "--rollback" ]; then
  last="$(ls -dt /root/nginx-backup-* 2>/dev/null | head -1 || true)"
  [ -n "$last" ] || { echo "✗ 没找到任何备份（/root/nginx-backup-*）"; exit 1; }
  cp -a "$last/nginx/." "$CONF_DIR/"
  nginx -t && systemctl reload nginx && echo "✓ 已还原：$last"
  exit 0
fi

echo "==> 备份现有 nginx 配置到 $BACKUP"
mkdir -p "$BACKUP/nginx"
cp -a "$CONF_DIR/." "$BACKUP/nginx/"

echo "==> 准备自签证书（兜底块用；只为能完成 TLS 握手，不给任何内容）"
mkdir -p "$SNIP_DIR"
if [ ! -s "$CRT" ] || [ ! -s "$KEY" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -subj "/CN=invalid" -keyout "$KEY" -out "$CRT" >/dev/null 2>&1
  echo "    已生成 $CRT"
else
  echo "    已存在，跳过"
fi

echo "==> 写兜底块 $AVAIL"
cat > "$AVAIL" <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}

server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name _;
    ssl_certificate     /etc/nginx/snippets/self-signed.crt;
    ssl_certificate_key /etc/nginx/snippets/self-signed.key;
    return 444;
}
EOF
ln -sf "$AVAIL" "$ENABLED"

echo "==> nginx -t"
if ! nginx -t; then
  echo "✗ 校验没过（多半是 listen 的协议选项和现有块不一致，报 'protocol options redefined'）"
  echo "  正在还原备份 ..."
  cp -a "$BACKUP/nginx/." "$CONF_DIR/"
  echo "✓ 已还原。把上面 nginx -t 的报错发我即可 ✓"
  exit 1
fi
systemctl reload nginx
echo "✓ 已 reload"

echo "==> 自检"
ok="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL" || true)"
bad="$(curl -k -s -o /dev/null -w '%{http_code}' -H "Host: $FAKE_HOST" https://127.0.0.1/ || true)"
echo "    你自己的站 $SITE_URL      → $ok    （应为 200）"
echo "    陌生域名 Host: $FAKE_HOST → $bad    （应为 000/400/444 之类，反正**不是 200**）"
if [ "$ok" = "200" ] && [ "$bad" != "200" ]; then
  echo "✓ 搞定：绑定过的域名照常，没绑定的一个字都不给"
else
  echo "⚠️ 结果不对：自己站=$ok 陌生域名=$bad —— 先别走开，把这两行发我"
fi