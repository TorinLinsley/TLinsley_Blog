#!/usr/bin/env bash
#
# TLinsleyBlog 控制台（Linux）—— **网页模式**，不开 Python 图形窗口。
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

# 端口被占住就别硬起：最常见是 SSH 隧道还开着（把 3010/7646 转到服务器了），
# 那种情况下前端连到的是服务器上的控制台、本地后端根本起不来，页面就没法用。
port_listening() {
  # Linux 用 ss；没有就用 netstat；Windows 的 netstat 不认 -l，所以只加 -an，
  # 再兜底用 bash 自带 /dev/tcp 连一下 127.0.0.1。
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -qE "[:.]$1[[:space:]]" && return 0
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | grep -qiE "[:.]$1[[:space:]].*LISTEN" && return 0
  fi
  (exec 3<>/dev/tcp/127.0.0.1/"$1") 2>/dev/null && { exec 3<&- 3>&-; return 0; }
  return 1
}
for _p in "$API_PORT" "$WEB_PORT"; do
  if port_listening "$_p"; then
    echo "❌ 端口 $_p 已经被占用了，先关掉占用它的程序再运行。" >&2
    echo "   看是谁占的：ss -ltnp | grep :$_p" >&2
    echo "   常见原因：① 上次的控制台/后端窗口还开着  ② SSH 隧道把 $API_PORT/$WEB_PORT 转到服务器了" >&2
    exit 1
  fi
done

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

# .next 里如果躺着上一次「打包构建」的产物，dev 模式会跟它打架：Turbopack 反复 panic，
# 浏览器上的表现就是「页面一直自动刷新、根本没法用」。检测到就先删掉，让 dev 自己重建。
if [ -e .next/BUILD_ID ] || [ -e .next/standalone ]; then
  echo ">>> .next 里是旧的构建产物，先删掉再启动（否则页面会一直自动刷新）..."
  rm -rf .next
fi

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
