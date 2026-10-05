# Mistral Vibe Code

Vibe Code, Mistral's coding mode, runs this server through its CLI and its VS Code extension. Both read the same `config.toml`, so one entry covers both.

Which Mistral product can use it:

| Product                                           | Can it use this server? | Why                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vibe Code CLI                                     | Yes                     | It starts local servers with the `stdio` transport.                                                                                                                                                                                     |
| Vibe Code VS Code extension                       | Yes                     | It uses the CLI's configuration, MCP servers included.                                                                                                                                                                                  |
| Vibe Work (formerly Le Chat), web and mobile apps | Self-hosted only        | It connects only to remote servers: "the server must be accessible over HTTPS with a valid TLS certificate". This server runs on your machine over stdio, unless you [host an instance](../self-hosting.md#vibe-work-formerly-le-chat). |
| Vibe Code Web (remote cloud sessions)             | Not covered             | Its documentation describes no MCP server setup.                                                                                                                                                                                        |

## Before you start

- Install the [Vibe Code CLI](https://docs.mistral.ai/vibe/code/cli/install-setup) and run `vibe` once, or install the [VS Code extension](https://docs.mistral.ai/vibe/code/vs-code-extension/install-authenticate) and sign in. The CLI creates `~/.vibe/config.toml` on its first start.
- For the npx variant, install Node.js 22 or later; for the Docker variant, install Docker. See [Prerequisites](../getting-started.md#prerequisites).
- Vibe waits 10 seconds by default for a server to start, and the first start downloads the package or the image. [Pre-warm it](../getting-started.md#pre-warm-the-first-start) once, or raise `startup_timeout_sec` (see below).

## Where the configuration lives

Vibe reads `config.toml` from two places:

- `~/.vibe/config.toml`: your user configuration, for every project. Use this one. The `VIBE_HOME` environment variable moves the `~/.vibe` folder.
- `./.vibe/config.toml` in the current project: it takes precedence over the user file, but Vibe loads it only in a [trusted folder](#trusted-folders).

Open the user file with `open ~/.vibe/config.toml` (macOS), `xdg-open ~/.vibe/config.toml` (Linux) or `Invoke-Item ~\.vibe\config.toml` (Windows PowerShell).

The VS Code extension has no settings panel yet: it follows the same configuration files as the CLI, MCP servers and tool permissions included.

## Add the server

Append this block to the end of `config.toml`. The `[[mcp_servers]]` entry starts the server with npx; the `[tools.…]` tables allow its 15 tools without a prompt (see [Allow the tools without a prompt](#allow-the-tools-without-a-prompt)).

```toml
[[mcp_servers]]
name = "camptocamp"
transport = "stdio"
command = "npx"
args = ["-y", "@olaurendeau/mcp-camptocamp"]

[tools.camptocamp_search_routes]
permission = "always"

[tools.camptocamp_get_route]
permission = "always"

[tools.camptocamp_search_waypoints]
permission = "always"

[tools.camptocamp_get_waypoint]
permission = "always"

[tools.camptocamp_search_user_outings]
permission = "always"

[tools.camptocamp_get_outing]
permission = "always"

[tools.camptocamp_search_outings]
permission = "always"

# get_outings: v1.4.0 or later
[tools.camptocamp_get_outings]
permission = "always"

# outing_stats: v1.4.0 or later
[tools.camptocamp_outing_stats]
permission = "always"

[tools.camptocamp_search_areas]
permission = "always"

[tools.camptocamp_get_area]
permission = "always"

[tools.camptocamp_search_books]
permission = "always"

[tools.camptocamp_get_book]
permission = "always"

[tools.camptocamp_search_articles]
permission = "always"

[tools.camptocamp_get_article]
permission = "always"
```

To run the server with Docker instead, replace the `[[mcp_servers]]` entry with this one and keep the `[tools.…]` tables:

```toml
[[mcp_servers]]
name = "camptocamp"
transport = "stdio"
command = "docker"
args = ["run", "--rm", "-i", "ghcr.io/olaurendeau/mcp-camptocamp:latest"]
```

- `name` becomes the prefix of every tool name: Vibe calls the tools `camptocamp_search_routes`, `camptocamp_get_route`, and so on. Keep `camptocamp`, or the `[tools.…]` tables no longer match.
- Put the block at the end of the file: in TOML, a `key = value` line written after a table header belongs to that table.
- If the server still times out on its first start, add `startup_timeout_sec = 30` (seconds, default 10) to the `[[mcp_servers]]` entry. `tool_timeout_sec` (default 60) limits each tool call.

Mistral documents `vibe mcp add` only with the flags of remote servers (`--url`), so this page edits the file instead.

## Allow the tools without a prompt

Vibe asks before it runs an MCP tool, with its default agent, `accept-edits`, which auto-approves only file edits, and with the `ask` agent, which asks before every tool. A `[tools.<tool name>]` table with `permission = "always"` lets one tool run without asking; `permission = "ask"` keeps the prompt. An MCP tool's name is `{server_name}_{tool_name}`.

The agent names come from the Vibe README and source code. Mistral's documentation site still lists a `default` agent that "asks before running any tool": the Vibe changelog renamed it to `ask` in version 2.24.1 (2026-08-11) and made `accept-edits` the default agent, and v2.25.8 (2026-09-23), the latest release as of 2026-10-05, has no `default` agent.

Mistral documents no wildcard for permissions (the glob patterns of `enabled_tools` and `disabled_tools` only choose which tools are available), so the block above lists the 15 tools one by one. When this server adds a tool, add its table too.

- All 15 tools only read public data from the Camptocamp API; none of them changes anything. Mistral's general advice is to keep MCP tools that touch external systems on `permission = "ask"`: leave out the `[tools.…]` tables if you prefer to approve each call.
- When Vibe asks, the prompt can also offer a broader choice, such as always allowing this tool.
- Avoid the `auto-approve` agent just for this server: it approves every tool, shell commands included.

## Trusted folders

Vibe loads a project's `.vibe/` folder (configuration, MCP servers, tool permissions) only from a folder you trust:

- The first time you start an interactive session in a folder with project configuration, Vibe asks whether to trust it. It remembers the answer in `~/.vibe/trusted_folders.toml`.
- `vibe --trust` trusts the working directory for one run only.
- In a folder you have not trusted, Vibe ignores the project configuration and prints a warning; the user configuration in `~/.vibe/` still applies.

With the server in `~/.vibe/config.toml`, as above, it works in every folder.

## Check that it works

In a Vibe session, `/mcp` (or `/connectors`) lists the configured MCP servers, and `/mcp camptocamp` lists the server's tools. Then ask, for example: "What is the altitude of the Grande Casse? Use the Camptocamp tools."

If the server is missing, see [Troubleshooting](../troubleshooting.md), starting with [The server times out on its first start](../troubleshooting.md#the-server-times-out-on-its-first-start).

## Sources

- MCP servers (configuration, tool names, permissions, `/mcp`): https://docs.mistral.ai/vibe/code/cli/mcp-servers
- Configuration (file locations, `VIBE_HOME`, precedence): https://docs.mistral.ai/vibe/code/cli/configuration
- Safety, approvals, and permissions (agents, trusted folders, per-tool permissions): https://docs.mistral.ai/vibe/code/safety-approvals-permissions
- Agents: https://docs.mistral.ai/vibe/code/cli/agents
- VS Code extension settings: https://docs.mistral.ai/vibe/code/vs-code-extension/settings
- Mistral Vibe README (built-in agents, timeout defaults, `vibe mcp add`): https://github.com/mistralai/mistral-vibe
- Mistral Vibe changelog (version 2.24.1, the `ask` agent): https://github.com/mistralai/mistral-vibe/blob/main/CHANGELOG.md
- Vibe modes: https://docs.mistral.ai/vibe/choose-chat-work-code
- Vibe Work MCP connectors: https://docs.mistral.ai/vibe/work/connectors/mcp-connectors

Last verified: 2026-10-05 against official docs
