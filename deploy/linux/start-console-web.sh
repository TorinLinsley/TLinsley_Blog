#!/usr/bin/env bash
#
# 控制台「纯网页」模式：**不开 pywebview 窗口**，后端 + 前端各起一个固定端口，用浏览器访问。
# 功能和控制台窗口完全一样（编辑、保存、同步、图片上传都在）。
#
#   bash start-console-web.sh             默认 后端 7646 / 前端 3010
#   WEB_PORT=3011 bash start-console-web.sh
#
# 起完**不会**自动开浏览器，自己打开 http://127.0.0.1:3010 即可。
# 想在物理机浏览器里用（页面在虚拟机跑）：
#   物理机执行  ssh -L 3010:127.0.0.1:3010 -L 7646:127.0.0.1:7646 tlinsley@<虚拟机IP>
#   然后物理机浏览器打开 http://127.0.0.1:3010

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CONSOLE="$ROOT/my-blog-manager"
API_PORT="${API_PORT:-7646}"
WEB_PORT="${WEB_PORT:-3010}"

[ -d "$CONSOLE" ] || { echo "❌ 没找到 $CONSOLE" >&2; exit 1; }

cd "$CONSOLE"

# 前端靠这个文件知道后端端口
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
