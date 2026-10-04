#!/usr/bin/env bash
#
# TLinsleyBlog 更新到最新版（无损）
#
#   bash Update.sh              更新
#   bash Update.sh --dry-run    只预览这次会改什么，不真改文件
#   bash Update.sh --from <目录> 从本地目录更新（离线用）
#
# 规则：
#   · 文章 / 说说 / 资源 / 工具 / 图片、站点配置、data/*.ts、本机配置 —— 一律不覆盖 ✓
#   · 你没改过的代码 → 用新版覆盖（旧文件备份进 .update-backup-* ✓）
#   · 你改过的代码   → 能自动三方合并就合并；冲突则保留你的版本，另存 .merge / .new ✓
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

cat <<'BANNER'
==================================================
   TLinsleyBlog  更新到最新版（无损）

   · 文章 / 说说 / 资源 / 工具 / 图片、站点配置、
     data/*.ts、本机配置 —— 一律不覆盖 ✓
   · 你没改过的代码：直接用新版覆盖
     （旧文件会备份到 .update-backup-* ✓）
   · 你改过的代码：能自动合并就合并；
     冲突时保留你的版本，另存 .merge / .new ✓
==================================================
BANNER

command -v node >/dev/null 2>&1 || { echo "❌ 没检测到 Node.js，请先安装：https://nodejs.org/" >&2; exit 1; }

node "$HERE/scripts/update.mjs" "$@"
