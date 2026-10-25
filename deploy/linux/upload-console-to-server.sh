#!/usr/bin/env bash

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CONSOLE="${CONSOLE:-$ROOT/my-blog-manager}"
ENV_FILE="${ENV_FILE:-$HERE/server.env}"

WITH_CONTENT=0
DRY_RUN=""
for arg in "$@"; do
  case "$arg" in
    --with-content) WITH_CONTENT=1 ;;
    --dry-run) DRY_RUN="--dry-run" ;;
  esac
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
CONSOLE_DIR="${CONSOLE_DIR:-/srv/www/console}"
SSH_KEY="${SSH_KEY:-}"

[ -d "$CONSOLE" ] || { echo "❌ 本地控制台目录不存在: $CONSOLE" >&2; exit 1; }
command -v rsync >/dev/null || { echo "❌ 没装 rsync（sudo apt install rsync）" >&2; exit 1; }

SSH_ARGS=(-p "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
if [ -n "$SSH_KEY" ]; then
  SSH_ARGS+=(-i "$SSH_KEY")
fi

EXCLUDES=(
  --exclude 'node_modules'
  --exclude '.next'
  --exclude '.git'
  --exclude '.code-hash'
  --exclude '.lock-hash'
  --exclude 'data/deploy_config.json'
  --exclude 'public/backend_config.json'
)

if [ "$WITH_CONTENT" = "0" ]; then
  EXCLUDES+=(
    --exclude 'posts'
    --exclude 'chatters'
    --exclude 'moments'
    --exclude 'resources'
    --exclude 'public/uploads'
  )
  echo "==> 只同步代码（内容保留服务器上的现状；首次请加 --with-content）"
else
  echo "==> 连内容一起同步（首次用）"
fi

echo "==> 同步 $CONSOLE/  →  $SERVER_SSH:$CONSOLE_DIR/"
ssh "${SSH_ARGS[@]}" "$SERVER_SSH" "sudo mkdir -p '$CONSOLE_DIR' && sudo chown \$(whoami) '$CONSOLE_DIR'" || true

rsync -az --delete --info=stats1 ${DRY_RUN} \
  "${EXCLUDES[@]}" \
  -e "ssh ${SSH_ARGS[*]}" \
  "$CONSOLE/" "$SERVER_SSH:$CONSOLE_DIR/"

if [ -n "$DRY_RUN" ]; then
  echo "==> --dry-run：只看清单，没动服务器。"
  exit 0
fi

echo "==> 服务器上重建控制台（npm run build + 重启）"
ssh "${SSH_ARGS[@]}" "$SERVER_SSH" "sudo bash /srv/www/rebuild-console.sh"

echo "==> 完成 ✅"