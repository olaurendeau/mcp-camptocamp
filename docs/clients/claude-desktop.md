# Claude Desktop

Claude Desktop starts this server on your computer from its configuration file, `claude_desktop_config.json`, and talks to it over stdio.

Two other ways to add tools to Claude don't work with this server:

- **Custom connectors** (remote MCP), including in Claude Desktop: Claude connects to them "from Anthropic's cloud infrastructure, rather than from your local device", so the server "must be reachable over the public internet". This server is a local program with no public address.
- **claude.ai and Cowork**: Anthropic's help center says that local servers configured in `claude_desktop_config.json` "aren't available in Cowork or claude.ai".

To use the server from a terminal instead, see [Claude Code](claude-code.md).

## Prerequisites

- Claude Desktop, which is available for macOS and Windows. To update it, open the Claude menu and select "Check for Updates...".
- One way to run the server:
  - npx: [Node.js](https://nodejs.org/en/download) 22 or later. Check with `node --version`.
  - Docker: [Docker](https://docs.docker.com/get-started/get-docker/).

The first start downloads the npm package or the Docker image. Download it once beforehand, as shown in [Pre-warm the first start](../getting-started.md#pre-warm-the-first-start).

## Add the server

1. Open the configuration file. Click the Claude menu in your system's menu bar, not the settings inside the Claude window, and select "Settings...". In the Settings window, open the "Developer" tab, then click "Edit Config". Claude Desktop creates the file if it doesn't exist yet. It is at:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
2. Add the `camptocamp` entry under `mcpServers`, with one of the two variants below. If the file already has an `mcpServers` object, add the entry inside it and keep the other servers.
3. Save the file, quit Claude Desktop completely, then open it again. Claude Desktop needs a restart to load the new configuration and start the server.

### npx variant

```json
{
  "mcpServers": {
    "camptocamp": {
      "command": "npx",
      "args": ["-y", "@olaurendeau/mcp-camptocamp"]
    }
  }
}
```

`-y` "automatically confirms the installation of the server package".

### Docker variant

```json
{
  "mcpServers": {
    "camptocamp": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "ghcr.io/olaurendeau/mcp-camptocamp:latest"]
    }
  }
}
```

Keep `-i`: without it, the server gets no input and stops at once (see [Troubleshooting](../troubleshooting.md#docker-the-server-stops-right-after-it-starts)).

## Check that Claude Desktop sees the server

After the restart, click the "Add files, connectors, and more" button at the bottom left of the message box. Move the mouse over "Connectors", click "Manage connectors", then select `camptocamp`. It lists the server's 15 tools.

## Approve the tool calls

The MCP documentation for Claude Desktop says: "All actions require your explicit approval before execution". Claude asks before it calls one of the server's tools, and you can deny the request.

That documentation describes no setting that approves a server's tools in advance, so this page gives none. The 15 tools only read public Camptocamp data: they don't change anything on Camptocamp or on your computer.

## Try it

Start a new conversation and ask, for example:

> What is the altitude of the Barre des Écrins on Camptocamp? Give the link.

Claude should find the summit with `search_waypoints`, then read it with `get_waypoint`, whose output gives the altitude and the camptocamp.org link. Claude Desktop asks you to approve each of these calls.

## Troubleshooting

- The server is missing from the connectors: see [Claude Desktop does not show the server](../troubleshooting.md#claude-desktop-does-not-show-the-server). Claude Desktop writes MCP logs to `~/Library/Logs/Claude` on macOS and `%APPDATA%\Claude\logs` on Windows. `mcp-server-camptocamp.log` holds what the server writes to stderr.
- On Windows, an `ENOENT` error with `${APPDATA}` in a path: see [Windows: ENOENT and `${APPDATA}`](../troubleshooting.md#windows-enoent-and-appdata-in-the-claude-desktop-logs).
- The server fails on its first start only: [pre-warm it](../getting-started.md#pre-warm-the-first-start).
- Run the server outside Claude Desktop with the [smoke test](../getting-started.md#smoke-test) to see its errors.

## Sources

- Connect to local MCP servers (Model Context Protocol documentation): https://modelcontextprotocol.io/docs/develop/connect-local-servers
- Get started with custom connectors using remote MCP (Claude Help Center): https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp

Last verified: 2026-10-05 against official docs
