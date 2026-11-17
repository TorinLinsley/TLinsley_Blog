#!/usr/bin/env bash
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
