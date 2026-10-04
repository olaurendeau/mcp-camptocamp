# mcp-camptocamp documentation

This MCP server gives an LLM read-only access to [Camptocamp.org](https://www.camptocamp.org): routes, summits and huts, trip reports (outings), areas, books and articles. The LLM can then quote altitudes, ratings and route descriptions from Camptocamp instead of guessing them.

The server runs on your machine and talks to its client over stdio. A client that can start a local command can use it. A client that only connects to remote servers by URL cannot.

## Start here

- [Getting started](getting-started.md): prerequisites, the npx and Docker commands, pre-warming the first start, a smoke test, and the configuration for Claude Code and other MCP clients.
- [Troubleshooting](troubleshooting.md): the server does not start, times out, or does not show up in your client.

## Clients

- [Claude Desktop](clients/claude-desktop.md): the `claude_desktop_config.json` entry, checking the connectors, and tool approval.
- [Claude Code](clients/claude-code.md): the `claude mcp add` command, scopes, the allow rule that stops permission prompts, and Claude Code's limits.
- [ChatGPT desktop app and Codex](clients/chatgpt-desktop-and-codex.md): the ChatGPT desktop app, Codex CLI and the Codex IDE extension, which share one configuration on the same Codex host. ChatGPT on the web cannot use this server.
- [Mistral Vibe Code](clients/mistral-vibe-code.md): the Vibe Code CLI and its VS Code extension, with the `config.toml` entry and per-tool permissions.
- [Gemini CLI and Gemini Code Assist](clients/gemini-cli.md): `settings.json`, folder trust, and a policy rule that allows the read-only tools.

For a client without its own page here, use the [configuration for other MCP clients](getting-started.md#other-mcp-clients).

## Guides

- [Agent SDKs](agent-sdks.md): start the server from your own agent code with the OpenAI Agents SDK (Python and JS), the Mistral Python SDK or google-genai (Python and JS).
- [System prompt](system-prompt.md): a prompt to paste into your agent, so the model quotes Camptocamp, cites it and says when a value is missing.

Other guides on using the tools with an LLM are listed here as they are written.

## Tool reference

- [Tool reference](tools/README.md): one page per tool, with its purpose, its inputs generated from the registered schema, and the tools to call before or after it.
