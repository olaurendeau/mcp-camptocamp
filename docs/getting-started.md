# Getting started

The server is a local program: your MCP client starts it and talks to it over stdio (standard input and output). You don't start it yourself, except once to [pre-warm](#pre-warm-the-first-start) it or to [test](#smoke-test) it. It needs no account and no API key; it calls the public Camptocamp API (`api.camptocamp.org`), so the machine needs internet access.

Pick one way to run it:

- [npx](#quick-start-npx): needs Node.js, downloads the npm package on first use.
- [Docker](#quick-start-docker): needs Docker, runs the published image, which includes Node.js.

## Prerequisites

- For npx: [Node.js](https://nodejs.org/en/download) 22 or later. Check with `node --version`. With an older Node.js, npx silently falls back to an older release of the server (see [Troubleshooting](troubleshooting.md#the-server-is-older-than-expected-or-lang-is-ignored)).
- For Docker: [Docker](https://docs.docker.com/get-started/get-docker/). The image runs on amd64 and arm64.
- For the smoke test only: [jq](https://jqlang.org/download/).

Use `camptocamp` as the server name in every client: lowercase, without underscores. Gemini CLI asks for server names without underscores, and Mistral Vibe Code prefixes each tool with the server name (`camptocamp_search_routes`).

## Quick start (npx)

The command your client runs:

```sh
npx -y @olaurendeau/mcp-camptocamp
```

`-y` answers yes to the prompt npx shows before installing a package it doesn't have yet ([npm docs](https://docs.npmjs.com/cli/v11/commands/npx)). npx keeps the package in the npm cache.

## Quick start (Docker)

The command your client runs:

```sh
docker run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:latest
```

- `-i` keeps the container's standard input open. Without it, the server reads no input and exits at once ([Troubleshooting](troubleshooting.md#docker-the-server-stops-right-after-it-starts)).
- `--rm` removes the container when it exits.

The image is listed on [GitHub Packages](https://github.com/olaurendeau/mcp-camptocamp/pkgs/container/mcp-camptocamp).

## Pre-warm the first start

The first start downloads the npm package or the Docker image, which can take longer than a client waits for a server to start: Codex and Mistral Vibe Code wait 10 seconds by default. Download it once beforehand.

With Docker:

```sh
docker pull ghcr.io/olaurendeau/mcp-camptocamp:latest
```

`docker run` only pulls an image that is missing, so run this `docker pull` again to update to a new release.

With npx, run the server once in a terminal:

```sh
npx -y @olaurendeau/mcp-camptocamp
```

Once the download is done, the server prints nothing and waits for a client on its standard input. Press Ctrl+C to stop it.

If a client still times out, raise its startup timeout: see [Troubleshooting](troubleshooting.md#the-server-times-out-on-its-first-start).

## Smoke test

This sends the same messages as the CI smoke test: an MCP `initialize`, then `tools/list`. It prints the server's name and version, then the number of tools.

```sh
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npx -y @olaurendeau/mcp-camptocamp \
  | jq -c 'if .id == 1 then .result.serverInfo else (.result.tools | length) end'
```

For Docker, replace the `npx` line with `| docker run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:latest \`.

Output, captured from v1.3.0 on 2026-10-04 with both commands:

```text
{"name":"mcp-camptocamp","version":"1.3.0"}
13
```

The version should be 1.3.0 or later, and the server should list 13 tools.

## Connect a client

### Claude Code

Add the server for your user, in every project:

```sh
claude mcp add --transport stdio --scope user camptocamp -- npx -y @olaurendeau/mcp-camptocamp
```

With Docker:

```sh
claude mcp add --transport stdio --scope user camptocamp -- docker run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:latest
```

The `--` is required: everything after it is the command that starts the server. Without `--scope`, the server is added for the current project only (`local` scope). Check it with `claude mcp list`, or `/mcp` inside Claude Code.

### Other MCP clients

Clients configured with an `mcpServers` JSON object, such as Claude Desktop (`claude_desktop_config.json`) and Gemini CLI (`settings.json`), take this entry:

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

With Docker:

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

If the file already has an `mcpServers` object, add the `camptocamp` entry to it. Claude Desktop needs a restart to load the file: quit it completely, then open it again.

## Next steps

- [Troubleshooting](troubleshooting.md) if the server does not show up.
- [Documentation index](README.md).

## Sources

- Claude Code: https://code.claude.com/docs/en/mcp
- Claude Desktop: https://modelcontextprotocol.io/docs/develop/connect-local-servers
- Codex: https://learn.chatgpt.com/docs/extend/mcp
- Mistral Vibe Code: https://docs.mistral.ai/vibe/code/cli/mcp-servers and https://github.com/mistralai/mistral-vibe
- Gemini CLI: https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
- npx: https://docs.npmjs.com/cli/v11/commands/npx
- docker run: https://docs.docker.com/reference/cli/docker/container/run/

Last verified: 2026-10-04 against official docs
