# mcp-camptocamp documentation

This MCP server gives an LLM read-only access to [Camptocamp.org](https://www.camptocamp.org): routes, summits and huts, trip reports (outings), areas, books and articles. The LLM can then quote altitudes, ratings and route descriptions from Camptocamp instead of guessing them.

The server runs on your machine and talks to its client over stdio. A client that can start a local command can use it. A client that only connects to remote servers by URL cannot: see [Remote-only clients](clients/remote-only.md).

## Start here

- [Getting started](getting-started.md): prerequisites, the npx and Docker commands, pre-warming the first start, a smoke test, and the configuration for Claude Code and other MCP clients.
- [Troubleshooting](troubleshooting.md): the server does not start, times out, or does not show up in your client.

## Clients

- [Claude Desktop](clients/claude-desktop.md): the `claude_desktop_config.json` entry, checking the connectors, and tool approval.
- [Claude Code](clients/claude-code.md): the `claude mcp add` command, scopes, the allow rule that stops permission prompts, and Claude Code's limits.
- [ChatGPT desktop app and Codex](clients/chatgpt-desktop-and-codex.md): the ChatGPT desktop app, Codex CLI and the Codex IDE extension, which share one configuration on the same Codex host. ChatGPT on the web cannot use this server.
- [Mistral Vibe Code](clients/mistral-vibe-code.md): the Vibe Code CLI and its VS Code extension, with the `config.toml` entry and per-tool permissions.
- [Gemini CLI and Gemini Code Assist](clients/gemini-cli.md): `settings.json`, folder trust, and a policy rule that allows the read-only tools.
- [Remote-only clients](clients/remote-only.md): Claude.ai custom connectors, ChatGPT on the web, OpenAI hosted MCP tools, Vibe Work, Mistral Studio Connectors and the Gemini API's remote MCP, which cannot use this server, and the local client of the same vendor to use instead.

For a client without its own page here, use the [configuration for other MCP clients](getting-started.md#other-mcp-clients).

## Support matrix

Whether each client can use this server today, the page that explains it, and the date that page was last checked against the vendor's official docs.

| Client                                                            | Works?                          | Page                                                                                             | Last verified |
| ----------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ | ------------- |
| Claude Desktop                                                    | Yes, stdio                      | [Claude Desktop](clients/claude-desktop.md)                                                      | 2026-10-05    |
| Claude Code                                                       | Yes, stdio                      | [Claude Code](clients/claude-code.md)                                                            | 2026-10-05    |
| Claude.ai custom connectors (web, mobile, Cowork, Claude Desktop) | No, remote servers only         | [Remote-only clients](clients/remote-only.md#claudeai-custom-connectors)                         | 2026-10-05    |
| ChatGPT desktop app                                               | Yes, stdio                      | [ChatGPT desktop app and Codex](clients/chatgpt-desktop-and-codex.md#in-the-chatgpt-desktop-app) | 2026-10-05    |
| Codex CLI and Codex IDE extension                                 | Yes, stdio                      | [ChatGPT desktop app and Codex](clients/chatgpt-desktop-and-codex.md)                            | 2026-10-05    |
| ChatGPT on the web (developer mode)                               | No, remote servers only         | [Remote-only clients](clients/remote-only.md#chatgpt-on-the-web)                                 | 2026-10-05    |
| OpenAI Agents SDK (Python and JS), `MCPServerStdio`               | Yes, stdio                      | [Agent SDKs](agent-sdks.md#openai-agents-sdk-python)                                             | 2026-10-05    |
| OpenAI hosted MCP tools (`HostedMCPTool`)                         | No, remote servers only         | [Remote-only clients](clients/remote-only.md#openai-hosted-mcp-tools)                            | 2026-10-05    |
| Mistral Vibe Code CLI and VS Code extension                       | Yes, stdio                      | [Mistral Vibe Code](clients/mistral-vibe-code.md)                                                | 2026-10-05    |
| Vibe Work (formerly Le Chat)                                      | No, remote servers only         | [Remote-only clients](clients/remote-only.md#vibe-work-formerly-le-chat)                         | 2026-10-05    |
| Mistral Studio Connectors                                         | No, remote servers only         | [Remote-only clients](clients/remote-only.md#mistral-studio-connectors)                          | 2026-10-05    |
| Mistral Python SDK                                                | Yes, stdio                      | [Agent SDKs](agent-sdks.md#mistral-python-sdk)                                                   | 2026-10-05    |
| Gemini CLI                                                        | Yes, stdio, in a trusted folder | [Gemini CLI and Gemini Code Assist](clients/gemini-cli.md)                                       | 2026-10-05    |
| Gemini Code Assist (VS Code, IntelliJ)                            | Yes, stdio, in agent mode       | [Gemini CLI and Gemini Code Assist](clients/gemini-cli.md#gemini-code-assist)                    | 2026-10-05    |
| google-genai SDK (Python and JS)                                  | Yes, stdio, experimental        | [Agent SDKs](agent-sdks.md#google-genai-python-experimental)                                     | 2026-10-05    |
| Gemini API remote MCP (Interactions API)                          | No, remote servers only         | [Remote-only clients](clients/remote-only.md#gemini-api-remote-mcp)                              | 2026-10-05    |
| Gemini app (gemini.google.com)                                    | Not documented                  | [Remote-only clients](clients/remote-only.md#gemini-app-geminigooglecom)                         | 2026-10-05    |

## Guides

- [Agent SDKs](agent-sdks.md): start the server from your own agent code with the OpenAI Agents SDK (Python and JS), the Mistral Python SDK or google-genai (Python and JS).
- [Using the tools with an LLM](using-with-llms.md): which tools to chain for a region, a summit altitude, a hut, recent conditions or guidebooks; what each output line means (URL, Language, user-written text, paging, missing data, errors); and a real June ski-tour example.
- [System prompt](system-prompt.md): a prompt to paste into your agent, so the model quotes Camptocamp, cites it and says when a value is missing.
- [Development](development.md): working on the server itself: the make targets, the live API contract tests, releases and the stack.

## Tool reference

- [Tool reference](tools/README.md): one page per tool, with its purpose, its inputs generated from the registered schema, and the tools to call before or after it.
