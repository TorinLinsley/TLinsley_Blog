#!/usr/bin/env bash
#
# TLinsleyBlog 前台博客（Linux / macOS）
#
#   bash Start-Blog.sh          默认 3000 端口
#   PORT=8080 bash Start-Blog.sh
#
# 逻辑和 Windows 的 Start-Blog.bat 一样：
#   查依赖 → 算代码指纹 → 变了才 npm run build → npm run start
#   （posts / chatters / moments / resources / tools / public/uploads 是运行时读盘的，
#     改这些内容不用重建，刷新页面就生效 ✓）
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BLOG="$HERE/XHBlogs"
PORT="${PORT:-3000}"

command -v node >/dev/null 2>&1 || { echo "❌ 没检测到 Node.js，请先安装：https://nodejs.org/" >&2; exit 1; }
[ -f "$BLOG/package.json" ] || { echo "❌ 没找到 XHBlogs/package.json（脚本要和 XHBlogs 同级）" >&2; exit 1; }

cd "$BLOG"

if [ ! -d node_modules ]; then
  echo ">>> 首次运行，正在 npm install ..."
  npm install --no-fund --no-audit
fi

echo ">>> 检查代码有没有变化..."
NEW_HASH="$(node "$HERE/scripts/code-hash.mjs" "$BLOG")"
OLD_HASH="$(cat .code-hash 2>/dev/null || true)"

if [ ! -f .next/BUILD_ID ] || [ "$NEW_HASH" != "$OLD_HASH" ]; then
  echo ">>> 代码/配置有变化，重新构建（第一次约 1-3 分钟）..."
  rm -rf .next
  npm run build
  printf '%s' "$NEW_HASH" > .code-hash
  echo ">>> 构建完成"
else
  echo ">>> 代码没变化，跳过构建"
fi

echo ">>> 启动：http://localhost:$PORT   （Ctrl+C 停止）"
if command -v xdg-open >/dev/null 2>&1; then
  (xdg-open "http://localhost:$PORT" >/dev/null 2>&1 &) || true
elif command -v open >/dev/null 2>&1; then
  (open "http://localhost:$PORT" >/dev/null 2>&1 &) || true
fi

exec npm run start -- -p "$PORT"
