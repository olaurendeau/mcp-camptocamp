# mcp-camptocamp documentation

This MCP server gives an LLM read-only access to [Camptocamp.org](https://www.camptocamp.org): routes, summits and huts, trip reports (outings), areas, books and articles. The LLM can then quote altitudes, ratings and route descriptions from Camptocamp instead of guessing them.

The server runs on your machine and talks to its client over stdio. A client that can start a local command can use it. A client that only connects to remote servers by URL cannot.

## Start here

- [Getting started](getting-started.md): prerequisites, the npx and Docker commands, pre-warming the first start, a smoke test, and the configuration for Claude Code and other MCP clients.
- [Troubleshooting](troubleshooting.md): the server does not start, times out, or does not show up in your client.

## Clients

- [Claude Desktop](clients/claude-desktop.md): the `claude_desktop_config.json` entry, checking the connectors, and tool approval.
- [Claude Code](clients/claude-code.md): the `claude mcp add` command, scopes, the allow rule that stops permission prompts, and Claude Code's limits.

For a client without its own page here, use the [configuration for other MCP clients](getting-started.md#other-mcp-clients).

## Guides

Guides on using the tools with an LLM are listed here as they are written.

## Tool reference

Until the tool reference pages are written, the [project README](../README.md) describes the 13 tools.
