#!/usr/bin/env bash

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CONSOLE="$ROOT/my-blog-manager"
API_PORT="${API_PORT:-7646}"
WEB_PORT="${WEB_PORT:-3010}"

[ -d "$CONSOLE" ] || { echo "❌ 没找到 $CONSOLE" >&2; exit 1; }

cd "$CONSOLE"

mkdir -p public
printf '{"api_port": %s}\n' "$API_PORT" > public/backend_config.json
if [ -d .next/standalone ]; then
  mkdir -p .next/standalone/public
  printf '{"api_port": %s}\n' "$API_PORT" > .next/standalone/public/backend_config.json
fi

cleanup() {
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ">>> 后端: http://127.0.0.1:$API_PORT"
python3 -m uvicorn cms_core.main:app --host 0.0.0.0 --port "$API_PORT" &
API_PID=$!

sleep 3

echo ">>> 前端: 浏览器打开 http://127.0.0.1:$WEB_PORT   （第一次编译十几秒）"
PORT="$WEB_PORT" HOSTNAME=127.0.0.1 npm run dev &
WEB_PID=$!

wait