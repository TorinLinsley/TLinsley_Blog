#!/usr/bin/env bash
#
# 起控制台（Linux）。
#
# 真正的逻辑在**项目根目录的 Start-Console.sh**（和 Windows 的 Start-Console.bat 一套），
# 这里只是给 `bash deploy/linux/start-console.sh` 这种老用法留个入口 ✓
#
# 控制台是**网页模式**：起 uvicorn(7646) + Next(3010)，然后浏览器打开 http://127.0.0.1:3010
# （不用 pywebview 那个桌面窗口了）
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

[ -f "$ROOT/Start-Console.sh" ] || { echo "❌ 没找到 $ROOT/Start-Console.sh" >&2; exit 1; }

exec bash "$ROOT/Start-Console.sh" "$@"
