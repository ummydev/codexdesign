#!/bin/sh
set -eu
DESIGN_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if ! command -v node >/dev/null 2>&1; then
  echo 'Codex Design requires Node.js >=22.12.0. Node was not found in the MCP process PATH.' >&2
  echo 'Agent: install a compatible Node.js version using the platform package manager, or ask the user to install it, then restart this MCP server. macOS with Homebrew: brew install node. Windows with WinGet: winget install --id OpenJS.NodeJS.LTS --exact --source winget. Do not download a private runtime.' >&2
  exit 1
fi
exec node "$DESIGN_ROOT/scripts/start.cjs" "$@"
