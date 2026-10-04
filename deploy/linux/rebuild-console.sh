#!/usr/bin/env bash
#
# 服务器侧：控制台构建（Node 依赖变了才 npm ci）+ 重启两个服务。
# 用法：
#   sudo bash /srv/www/rebuild-console.sh
#
# 由 upload-console-to-server.sh 上传完代码后自动调用，也可以手动跑。

set -euo pipefail

CONSOLE_DIR="${CONSOLE_DIR:-/srv/www/console}"
APP_USER="${APP_USER:-blog}"
NPM="${NPM:-/usr/bin/npm}"
LOCK_HASH_FILE="$CONSOLE_DIR/.lock-hash"

log() { printf '[console] %s\n' "$*"; }

run_as() {
  if [ "$(id -u)" = "0" ] && id -u "$APP_USER" >/dev/null 2>&1; then
    runuser -u "$APP_USER" -- "$@"
  else
    "$@"
  fi
}

[ -d "$CONSOLE_DIR" ] || { echo "❌ 控制台目录不存在: $CONSOLE_DIR" >&2; exit 1; }
[ -f "$CONSOLE_DIR/package.json" ] || { echo "❌ $CONSOLE_DIR 里没代码（先用 upload-console-to-server.sh 传上去）" >&2; exit 1; }

cd "$CONSOLE_DIR"

# node_modules 缺失、或 package-lock 变了 → 重新装依赖
LOCK_HASH="$(md5sum package-lock.json | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ ! -f "$LOCK_HASH_FILE" ] || [ "$(cat "$LOCK_HASH_FILE")" != "$LOCK_HASH" ]; then
  log "依赖有变化 → npm ci"
  run_as "$NPM" config set registry https://registry.npmmirror.com >/dev/null 2>&1 || true
  run_as "$NPM" ci
  echo "$LOCK_HASH" > "$LOCK_HASH_FILE"
  chown "$APP_USER:$APP_USER" "$LOCK_HASH_FILE" 2>/dev/null || true
else
  log "依赖没变 → 跳过 npm ci"
fi

# ⚠️ 每次构建前先把 .next 删掉。
#    Next/Turbopack 的构建缓存会跨版本复用：新旧 chunk 混在一起时，页面可能加载到
#    **上一版**的组件 chunk —— 曾经踩过这个坑：编辑器那段内联 <style> 在浏览器里
#    变成了 <style>false</style>（整段 CSS 一条都没生效，行号错位、字号全乱），
#    而磁盘上的新 chunk 里代码明明是好的。清掉再构建，多花一两分钟，省一堆玄学。
log "清掉 .next（避免新旧 chunk 混用）"
rm -rf "$CONSOLE_DIR/.next"

log "npm run build"
run_as "$NPM" run build

log "重启控制台服务"
systemctl restart xhconsole-api xhconsole-web
log "完成 ✅"
