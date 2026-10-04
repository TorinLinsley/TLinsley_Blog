#!/usr/bin/env bash
#
# TLinsleyBlog 控制台（Linux / macOS）—— **网页模式**，不开 Python 图形窗口。
#
#   bash Start-Console.sh              默认 后端 7646 / 前端 3010
#   WEB_PORT=3011 bash Start-Console.sh
#
# 和 Windows 的 Start-Console.bat 一样：起 uvicorn + Next，然后用浏览器访问
# http://127.0.0.1:3010 即可（编辑、保存、同步、图片上传都在）。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CONSOLE="$HERE/my-blog-manager"
API_PORT="${API_PORT:-7646}"
WEB_PORT="${WEB_PORT:-3010}"

[ -f "$CONSOLE/cms_core/main.py" ] || { echo "❌ 没找到 my-blog-manager/cms_core/main.py（脚本要和它同级）" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ 没检测到 Node.js，请先安装：https://nodejs.org/" >&2; exit 1; }

PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || { echo "❌ 没检测到 Python，请先安装：https://www.python.org/" >&2; exit 1; }

cd "$CONSOLE"

if [ ! -d node_modules ]; then
  echo ">>> 首次运行，正在 npm install ..."
  npm install --no-fund --no-audit
fi

if ! "$PY" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  echo ">>> 正在安装 Python 依赖 ..."
  "$PY" -m pip install -r requirements.txt
fi

# 前端靠这个文件知道后端端口
mkdir -p public
printf '{"api_port": %s}\n' "$API_PORT" > public/backend_config.json

cleanup() {
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ">>> 后端 API ：http://127.0.0.1:$API_PORT"
"$PY" -m uvicorn cms_core.main:app --host 127.0.0.1 --port "$API_PORT" &
API_PID=$!

sleep 3

echo ">>> 控制台页面：http://127.0.0.1:$WEB_PORT   （Ctrl+C 停止，第一次编译十几秒）"
if command -v xdg-open >/dev/null 2>&1; then
  (xdg-open "http://127.0.0.1:$WEB_PORT" >/dev/null 2>&1 &) || true
elif command -v open >/dev/null 2>&1; then
  (open "http://127.0.0.1:$WEB_PORT" >/dev/null 2>&1 &) || true
fi

PORT="$WEB_PORT" HOSTNAME=127.0.0.1 npm run dev
