"use strict";

// scripts/start.cts
var versionParts = process.versions.node.split(".").map(Number);
if (versionParts[0] < 22 || versionParts[0] === 22 && versionParts[1] < 12) {
  console.error(
    "Codex Design requires Node.js >=22.12.0. Current version: " + process.versions.node + ". Upgrade Node.js, ensure the MCP process PATH uses it, and restart the MCP server. macOS/Homebrew: brew install node. Windows/WinGet: winget install --id OpenJS.NodeJS.LTS --exact --source winget."
  );
  process.exit(1);
}
var { resolve: resolveEntry } = require("node:path");
var { pathToFileURL: entryUrl } = require("node:url");
var mode = process.argv[2] || "mcp";
if (!["mcp", "start", "stop", "status", "create", "import"].includes(mode)) {
  console.error("Usage: start.cjs [mcp|start|stop|status|create|import] [arguments]");
  process.exit(1);
}
if (mode === "mcp") process.argv.splice(2, 1);
var target = resolveEntry(__dirname, "../dist", mode === "mcp" ? "mcp.mjs" : "cli.mjs");
import(entryUrl(target).href).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
