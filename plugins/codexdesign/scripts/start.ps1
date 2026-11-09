$ErrorActionPreference = 'Stop'
$CanvasRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  [Console]::Error.WriteLine('Codex Design requires Node.js >=22.12.0. Agent: install Node.js with winget install --id OpenJS.NodeJS.LTS --exact --source winget, then restart Codex/MCP so PATH is refreshed. No private runtime is downloaded.')
  exit 1
}
& node (Join-Path $CanvasRoot 'scripts/start.cjs') @args
exit $LASTEXITCODE
