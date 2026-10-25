#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

[ -f "$ROOT/Start-Console.sh" ] || { echo "❌ 没找到 $ROOT/Start-Console.sh" >&2; exit 1; }

exec bash "$ROOT/Start-Console.sh" "$@"