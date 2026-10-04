#!/usr/bin/env bash
#
# TLinsleyBlog 更新到最新版（无损：内容/配置永不覆盖，你改过的代码走三方合并）
#
#   bash Update.sh             更新
#   bash Update.sh --dry-run   只预览，不改文件
#   bash Update.sh --from <目录>  从本地目录更新（离线用）
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

command -v node >/dev/null 2>&1 || { echo "❌ 没检测到 Node.js，请先安装：https://nodejs.org/" >&2; exit 1; }

exec node "$HERE/scripts/update.mjs" "$@"
