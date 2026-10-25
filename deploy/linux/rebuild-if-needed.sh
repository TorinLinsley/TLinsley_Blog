#!/usr/bin/env bash

set -euo pipefail

if [ -f /etc/tlblog.env ]; then
  # shellcheck disable=SC1091
  . /etc/tlblog.env
elif [ -f /etc/xhblogs.env ]; then
  # shellcheck disable=SC1091
  . /etc/xhblogs.env
fi

SERVICE="${1:-${SERVICE:-tlblog}}"
WORK="${WORK:-/srv/www/tlblog}"
APP_USER="${APP_USER:-${SUDO_USER:-blog}}"
NPM="${NPM:-/usr/bin/npm}"
HASH_FILE="$WORK/.code-hash"

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  APP_USER="$(id -un)"
fi

log() { printf '[deploy] %s\n' "$*"; }

run_as() {
  if [ "$(id -u)" = "0" ] && id -u "$APP_USER" >/dev/null 2>&1; then
    runuser -u "$APP_USER" -- "$@"
  else
    "$@"
  fi
}

[ -d "$WORK" ] || { echo "❌ 工作目录不存在: $WORK" >&2; exit 1; }
cd "$WORK"

CODE_HASH="$(
  find . -type f \
    -not -path './node_modules/*' -not -path './.next/*' -not -path './.git/*' \
    -not -path './posts/*' -not -path './chatters/*' -not -path './moments/*' \
    -not -path './resources/*' -not -path './tools/*' -not -path './public/uploads/*' \
    -not -path './.code-hash' -not -path './.lock-hash' \
    -print0 | sort -z | xargs -0 md5sum | md5sum | cut -d' ' -f1
)"
log "代码指纹: $CODE_HASH"

if [ -f "$HASH_FILE" ] && [ "$(cat "$HASH_FILE")" = "$CODE_HASH" ] && [ "${FORCE_BUILD:-0}" != "1" ]; then
  log "只有内容变化 → 不重建（页面运行时读文件，已经生效）✅"
  exit 0
fi

log "代码/配置有变化 → 清 .next + npm ci + build + 重启 $SERVICE"

log "清掉 .next（避免和上一版产物/缓存混用）"
rm -rf "$WORK/.next"

run_as "$NPM" config set registry https://registry.npmmirror.com >/dev/null 2>&1 || true
run_as "$NPM" ci
run_as "$NPM" run build
echo "$CODE_HASH" > "$HASH_FILE"
chown "$APP_USER:$APP_USER" "$HASH_FILE" 2>/dev/null || true
systemctl restart "$SERVICE"
log "重建并重启完成 ✅"