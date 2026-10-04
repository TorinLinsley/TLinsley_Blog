#!/usr/bin/env bash
#
# 服务器侧：检查工作目录里的「代码类文件」指纹，变了才 npm ci + build + 重启。
# 由 upload-to-server.sh 通过 ssh 调用：
#   sudo bash /srv/www/rebuild-if-needed.sh [服务名]
#   FORCE_BUILD=1 sudo -E bash /srv/www/rebuild-if-needed.sh tlblog   # 强制重建
#
# 为什么这么判断：posts / chatters / moments / resources / tools 这几个页面是 force-dynamic，
# 请求时直接读磁盘 —— 内容文件一落就生效，**不需要重新构建**；
# 只有代码、样式、data/*.ts、siteConfig.ts、package.json 这些改了才要 build。
# （tools/ 里是网页工具本体 + tools.json，控制台里加/改工具都写这里，也不该触发重建。）

set -euo pipefail

# 路径/用户由 setup-server.sh 写在 /etc/tlblog.env 里（命令行环境变量仍然可以覆盖）
if [ -f /etc/tlblog.env ]; then
  # shellcheck disable=SC1091
  . /etc/tlblog.env
elif [ -f /etc/xhblogs.env ]; then        # 目录还叫 xhblogs 时留下的旧配置，兼容一下
  # shellcheck disable=SC1091
  . /etc/xhblogs.env
fi

SERVICE="${1:-${SERVICE:-tlblog}}"
WORK="${WORK:-/srv/www/tlblog}"
APP_USER="${APP_USER:-${SUDO_USER:-blog}}"
NPM="${NPM:-/usr/bin/npm}"
HASH_FILE="$WORK/.code-hash"

# 用户不存在就退回当前用户（服务器上只有 root 的情况）
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  APP_USER="$(id -un)"
fi

log() { printf '[deploy] %s\n' "$*"; }

# 统一用跑站点的那个用户执行构建，避免 node_modules/.next 变成 root 所有、下次构建失败
run_as() {
  if [ "$(id -u)" = "0" ] && id -u "$APP_USER" >/dev/null 2>&1; then
    runuser -u "$APP_USER" -- "$@"
  else
    "$@"
  fi
}

[ -d "$WORK" ] || { echo "❌ 工作目录不存在: $WORK" >&2; exit 1; }
cd "$WORK"

# ⚠️ 一定要把 .code-hash / .lock-hash 排除掉：
#    它们就写在 $WORK 根目录里，算进指纹的话 —— 写完指纹文件 → 指纹变了 →
#    下次判断又"有变化" → 又 npm ci + build + 重启，永远走不到"不重建"那条分支 ✗
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

log "代码/配置有变化 → npm ci + build + 重启 $SERVICE"
run_as "$NPM" config set registry https://registry.npmmirror.com >/dev/null 2>&1 || true
run_as "$NPM" ci
run_as "$NPM" run build
echo "$CODE_HASH" > "$HASH_FILE"
chown "$APP_USER:$APP_USER" "$HASH_FILE" 2>/dev/null || true
systemctl restart "$SERVICE"
log "重建并重启完成 ✅"
