#!/usr/bin/env bash
#
# 在**虚拟机**上执行：把改好的博客前台同步到正式服务器，并让服务器按需重建。
#
#   bash upload-to-server.sh              # 全量同步（含 public/uploads，rsync 只传变化的部分）
#   bash upload-to-server.sh --dry-run    # 只看看会传哪些，不动服务器
#   FORCE_BUILD=1 bash upload-to-server.sh  # 强制重建（改了构建相关的东西但指纹没变时用）
#
# 前提：
#   1) 虚拟机的公钥已经放到服务器上（ssh-copy-id 一次即可）
#   2) server.env 填好了（照 server.env.example 复制）

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
BLOG="${BLOG:-$ROOT/XHBlogs}"
ENV_FILE="${ENV_FILE:-$HERE/server.env}"

DRY_RUN=""
for arg in "$@"; do
  [ "$arg" = "--dry-run" ] && DRY_RUN="--dry-run"
done

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$ENV_FILE"
else
  echo "❌ 没找到 $ENV_FILE（照 server.env.example 复制一份并填好）" >&2
  exit 1
fi

: "${SERVER_SSH:?server.env 里要填 SERVER_SSH=user@host}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/srv/www/tlblog}"
SERVICE="${SERVICE:-tlblog}"
SSH_KEY="${SSH_KEY:-}"

[ -d "$BLOG" ] || { echo "❌ 本地博客目录不存在: $BLOG" >&2; exit 1; }
command -v rsync >/dev/null || { echo "❌ 没装 rsync（sudo apt install rsync）" >&2; exit 1; }

SSH_ARGS=(-p "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
if [ -n "$SSH_KEY" ]; then
  SSH_ARGS+=(-i "$SSH_KEY")
fi

echo "==> 同步 $BLOG/  →  $SERVER_SSH:$REMOTE_DIR/"
rsync -az --delete --info=stats1 ${DRY_RUN} \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude '.code-hash' \
  --exclude 'npm-debug.log*' \
  -e "ssh ${SSH_ARGS[*]}" \
  "$BLOG/" "$SERVER_SSH:$REMOTE_DIR/"

if [ -n "$DRY_RUN" ]; then
  echo "==> --dry-run：只看清单，没动服务器。"
  exit 0
fi

echo "==> 服务器判断要不要重建（内容改动不会触发 build）"
if [ -n "${FORCE_BUILD:-}" ]; then
  ssh "${SSH_ARGS[@]}" "$SERVER_SSH" "sudo env FORCE_BUILD=1 bash /srv/www/rebuild-if-needed.sh $SERVICE"
else
  ssh "${SSH_ARGS[@]}" "$SERVER_SSH" "sudo bash /srv/www/rebuild-if-needed.sh $SERVICE"
fi

echo "==> 完成 ✅"
