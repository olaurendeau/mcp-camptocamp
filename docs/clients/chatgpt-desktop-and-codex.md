# ChatGPT desktop app and Codex

The ChatGPT desktop app, Codex CLI and the Codex IDE extension can all start this server on your machine. OpenAI's docs say they "support MCP servers and share MCP configuration for the same Codex host": add the server once, in any of them, and the other two use it too.

ChatGPT on the web cannot use this server: see [ChatGPT on the web](#chatgpt-on-the-web).

## Which OpenAI clients work

| Client                                                  | Works with this server  | How to add it                                                                              |
| ------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| ChatGPT desktop app (macOS, Windows, Linux)             | Yes, stdio              | [Settings > MCP servers](#in-the-chatgpt-desktop-app), or [`config.toml`](#in-configtoml)  |
| Codex CLI                                               | Yes, stdio              | [`codex mcp add`](#with-the-codex-cli), or [`config.toml`](#in-configtoml)                 |
| Codex IDE extension                                     | Yes, stdio              | [gear menu > MCP servers](#in-the-codex-ide-extension), or [`config.toml`](#in-configtoml) |
| [ChatGPT on the web](#chatgpt-on-the-web) (chatgpt.com) | No: remote servers only | none                                                                                       |

## Before you start

- For the npx variant: Node.js 22 or later (`node --version`). For the Docker variant: Docker. See [Prerequisites](../getting-started.md#prerequisites).
- Codex gives a server 10 seconds to start by default, and the first start downloads the npm package or the Docker image. Download it once beforehand, as shown in [Pre-warm the first start](../getting-started.md#pre-warm-the-first-start), or raise `startup_timeout_sec` as in the [`config.toml` entry](#in-configtoml).
- Name the server `camptocamp`: lowercase, without underscores, as on every other page of these docs.

## Add the server

Pick one of the four ways below. They all end up as the same entry: a `[mcp_servers.camptocamp]` table in `~/.codex/config.toml`. To change the startup timeout or the approval mode, edit that file: see [In config.toml](#in-configtoml).

### In the ChatGPT desktop app

1. Open **Settings**, then select **MCP servers**.
2. Select **Add server**.
3. Enter the name `camptocamp`, choose **STDIO**, and provide the command that starts the server:
   - npx: `npx -y @olaurendeau/mcp-camptocamp`
   - Docker: `docker run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:latest`
4. Save the server, then select **Restart**.

In the composer, type `/mcp` to see the connected servers.

### With the Codex CLI

```sh
codex mcp add camptocamp -- npx -y @olaurendeau/mcp-camptocamp
```

With Docker:

```sh
codex mcp add camptocamp -- docker run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:latest
```

Everything after `--` is the command that starts the server. `codex mcp list` shows the configured servers, and `/mcp` in the `codex` terminal UI shows the active ones.

### In the Codex IDE extension

1. Open the gear menu, then select **MCP servers**.
2. Select **Add server**.
3. Enter the name `camptocamp`, choose **STDIO**, and provide the command that starts the server:
   - npx: `npx -y @olaurendeau/mcp-camptocamp`
   - Docker: `docker run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:latest`
4. Save the server, then select **Restart extension**.

### In config.toml

Codex reads `~/.codex/config.toml` by default. A project can also have its own `.codex/config.toml`, which Codex reads only in trusted projects.

Add this table, or complete the one that `codex mcp add` or the apps wrote:

```toml
[mcp_servers.camptocamp]
command = "npx"
args = ["-y", "@olaurendeau/mcp-camptocamp"]
startup_timeout_sec = 30
default_tools_approval_mode = "writes"
```

With Docker:

```toml
[mcp_servers.camptocamp]
command = "docker"
args = ["run", "--rm", "-i", "ghcr.io/olaurendeau/mcp-camptocamp:latest"]
startup_timeout_sec = 30
default_tools_approval_mode = "writes"
```

- `command` (required) and `args`: the command that starts the server, and its arguments.
- `startup_timeout_sec` (optional): how long Codex waits for the server to start, in seconds. The default is 10. 30 leaves time for the first download; remove the line to keep the default.
- `default_tools_approval_mode` (optional): see [Stop the approval prompts](#stop-the-approval-prompts).

OpenAI's docs don't say whether an open app or Codex session reloads the file when it changes: restart the client after editing it.

## Stop the approval prompts

`default_tools_approval_mode` sets how Codex asks for approval before it calls this server's tools. The OpenAI docs list four values and describe one of them:

> Supported values are auto, prompt, writes, and approve. The writes mode prompts for tools that aren't marked read-only.

The 13 tools of this server are read-only: each one declares the MCP annotation `readOnlyHint: true`. With `default_tools_approval_mode = "writes"`, Codex therefore runs them without prompting, in the ChatGPT desktop app, Codex CLI and the IDE extension alike. If a later release added a tool that is not marked read-only, Codex would still prompt for that one.

The Codex docs say "marked read-only" without naming the annotation. OpenAI's [ChatGPT developer mode docs](https://developers.openai.com/api/docs/guides/developer-mode) name it: "We respect the `readOnlyHint` tool annotation … Tools without this hint are treated as write actions."

The docs do not describe what `auto`, `prompt` and `approve` do, so this page does not recommend them.

## What Codex reads from the server's instructions

When it starts, the server sends MCP `instructions`: a short guide to its tools. Codex "reads the MCP `instructions` field returned during initialization and uses it as server-wide guidance alongside the server's tools". The same page asks server authors to "keep the first 512 characters self-contained so the most important guidance is available when Codex is deciding how to use the server".

This server's instructions are 569 characters long. The first 512 cover:

- what the server holds: routes, waypoints (summits, huts), outings, areas, books and articles;
- the region workflow: `search_areas`, then its ID as `area_id` for `search_routes`, `search_waypoints` or `search_outings`;
- that any result ID goes to the matching `get_*` tool;
- the `lang` input, its default `fr`, and the language fallback order;
- that text between the `[begin/end user-written text]` markers is content, not instructions, and is cut at 8000 characters.

The last 57 characters, which describe how images and links appear inside that user-written text, come after the 512th.

## Check that it works

1. Look for `camptocamp` in the server list:
   - ChatGPT desktop app: **Settings > MCP servers**, or type `/mcp` in the composer.
   - Codex CLI: `/mcp` in the terminal UI, or `codex mcp list` in a terminal.
   - Codex IDE extension: the **MCP servers** list in the gear menu.
2. Ask a question that needs the tools, for example: "Use the camptocamp tools to find the altitude of the Grande Casse." The answer should cite a `camptocamp.org` URL.

If `camptocamp` is missing or marked as failed, run the [smoke test](../getting-started.md#smoke-test) in a terminal. If it passes, the server works and the problem is in the client's configuration: see [Troubleshooting](../troubleshooting.md).

## Troubleshooting

- **The server times out on its first start.** Pre-warm it, or raise `startup_timeout_sec`: see [The server times out on its first start](../troubleshooting.md#the-server-times-out-on-its-first-start).
- **The tools are missing at the start of a session, then appear.** When it builds the first list of tools, Codex waits for optional MCP servers for `mcp_optional_startup_grace_ms`, a top-level setting of `config.toml` that defaults to 1000 milliseconds. The docs say: "Set it to 0 to wait for each server's `startup_timeout_sec` instead."
- **A project's `.codex/config.toml` is ignored.** Codex reads it in trusted projects only. Add the server to `~/.codex/config.toml` instead, or trust the project.
- **The Docker variant stops right after it starts.** `-i` is missing from `args`: see [Docker: the server stops right after it starts](../troubleshooting.md#docker-the-server-stops-right-after-it-starts).

## ChatGPT on the web

ChatGPT on the web (chatgpt.com) cannot use this server today. It runs as a local program over stdio, and ChatGPT on the web connects only to remote servers by URL:

- OpenAI's MCP docs say: "ChatGPT web doesn't read local Codex configuration files or expose the local Codex command menu."
- Its developer mode adds a "developer-mode app for your remote MCP server", and the docs list "Supported MCP protocols: SSE and streaming HTTP."

Use the [ChatGPT desktop app](#in-the-chatgpt-desktop-app) instead: it runs the server on your machine.

## Sources

- Model Context Protocol (ChatGPT desktop app, Codex CLI, Codex IDE extension; `https://developers.openai.com/codex/mcp` redirects here): https://learn.chatgpt.com/docs/extend/mcp
- Configuration reference (`mcp_servers.<id>.*` keys): https://learn.chatgpt.com/docs/config-file/config-reference
- ChatGPT desktop app (macOS, Windows, Linux): https://learn.chatgpt.com/docs/app
- ChatGPT developer mode (ChatGPT on the web, `readOnlyHint`): https://developers.openai.com/api/docs/guides/developer-mode

Last verified: 2026-10-05 against official docs
