# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

Open a private advisory at [github.com/ummydev/codexdesign/security/advisories/new](https://github.com/ummydev/codexdesign/security/advisories/new). Include the plugin version (shown in `plugins/codexdesign/.codex-plugin/plugin.json`), your operating system, and the steps to reproduce.

We aim to acknowledge reports within 3 working days and to tell you what we will do about them within 14 days.

## Supported versions

Only the latest release on `main` receives security fixes. Update by refreshing the marketplace in Codex.

## Scope

Codex Design runs a local daemon that listens on `127.0.0.1` only and stores canvas projects in `~/.codex-design-plugin`. Reports about that daemon, the MCP server, the canvas web app and the install scripts are in scope.
