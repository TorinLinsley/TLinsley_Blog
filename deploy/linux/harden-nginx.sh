#!/usr/bin/env bash
# =============================================================================
# harden-nginx.sh —— 兜底 server 块：**任何没有在本机明确绑定的域名**，
#   就算解析到这台服务器，也拿不到一个字的内容 ✓
#
# 为什么需要（用户 2026-10-13 的实际遭遇）：
#   有人把 `pcss.cc` 的 A 记录指向了本机 IP → nginx 找不到匹配的 server_name
#   → 落到**默认 server 块**（= 排在最前面的那个，也就是博客）
#   → 于是打开 pcss.cc 看到的是整站内容、连证书都是 blog.torinlinsley.top 的 ✗
#   → 百度把它当"另一个有内容的站"收录了，白蹭内容与权重 ✗
#   （对方用 A 记录还是 CNAME 都无所谓：请求里的 Host 头永远是对方域名 ✓ 一定能拦 ✓）
#
# 做法：加一个 `default_server` 兜底块（server_name _），一律 `return 444`（直接断连）✓
#   ⚠️ 必须让它排在 include 顺序的第一位 → 文件名用 `00-` 开头 ✓
#   ⚠️ 443 上必须给一个证书（本机 nginx 1.18 还没有 `ssl_reject_handshake`）→ 用自签证书 ✓
#      （于是陌生域名看到的是"证书错误"，连内容都没有 ✓）
#   ⚠️ `listen` 的协议选项要和现有块一致（ssl / http2 / ipv6only），
#      否则 `nginx -t` 会报 "protocol options redefined for 0.0.0.0:443" ✗
#      —— 下面是 Ubuntu 22.04 + certbot 的常见写法；跑完**务必看一眼 nginx -t 的输出** ✓
#
# 用法：
#   sudo bash harden-nginx.sh              # 安装/更新（幂等，可重复跑；自动备份）
#   sudo bash harden-nginx.sh --rollback   # 还原到最近一次备份
# =============================================================================
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
SITE_URL="${SITE_URL:-https://blog.torinlinsley.top/}"   # 自检用：你自己的站
FAKE_HOST="${FAKE_HOST:-pcss.cc}"                        # 自检用：随便一个陌生域名

[ "$(id -u)" = "0" ] || { echo "请用 root 跑：sudo bash $0"; exit 1; }

# ── 还原 ─────────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--rollback" ]; then
  last="$(ls -dt /root/nginx-backup-* 2>/dev/null | head -1 || true)"
  [ -n "$last" ] || { echo "✗ 没找到任何备份（/root/nginx-backup-*）"; exit 1; }
  cp -a "$last/nginx/." "$CONF_DIR/"
  nginx -t && systemctl reload nginx && echo "✓ 已还原：$last"
  exit 0
fi

# ── 备份 ─────────────────────────────────────────────────────────────────────
echo "==> 备份现有 nginx 配置到 $BACKUP"
mkdir -p "$BACKUP/nginx"
cp -a "$CONF_DIR/." "$BACKUP/nginx/"

# ── 自签证书 ─────────────────────────────────────────────────────────────────
echo "==> 准备自签证书（兜底块用；只为能完成 TLS 握手，不给任何内容）"
mkdir -p "$SNIP_DIR"
if [ ! -s "$CRT" ] || [ ! -s "$KEY" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -subj "/CN=invalid" -keyout "$KEY" -out "$CRT" >/dev/null 2>&1
  echo "    已生成 $CRT"
else
  echo "    已存在，跳过"
fi

# ── 兜底块 ───────────────────────────────────────────────────────────────────
echo "==> 写兜底块 $AVAIL"
cat > "$AVAIL" <<'EOF'
# 🛡️ 兜底 server 块：任何**没有在本机明确绑定 server_name** 的域名，
#    解析到这台机器也拿不到内容 ✓（有人把域名指过来蹭内容/蹭收录时，直接断连 ✓）
#    ⚠️ 文件名必须是 00- 开头：nginx 按字母序加载，它才会成为 default_server ✓
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;                     # 444 = 不回任何响应，直接关连接
}

server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl ipv6only=on http2 default_server;
    server_name _;
    ssl_certificate     /etc/nginx/snippets/self-signed.crt;
    ssl_certificate_key /etc/nginx/snippets/self-signed.key;
    return 444;
}
EOF
ln -sf "$AVAIL" "$ENABLED"

# ── 校验（不过就还原） ───────────────────────────────────────────────────────
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

# ── 自检 ─────────────────────────────────────────────────────────────────────
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
