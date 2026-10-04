# Remote-only clients

Some clients connect only to remote MCP servers: you give them the URL of a server on the internet, and the vendor's cloud connects to it. They cannot start this server on your machine, so they cannot use it as these docs set it up.

This server has no HTTP transport today. It is a local program that your client starts on your machine and talks to over stdio, and both of its packages in the MCP registry, npm and Docker, declare the `stdio` transport. It has no URL to give to a remote-only client.

Each vendor below also has a client that starts local servers. Use that one instead: it is linked in each section.

## Why a bridge on your machine doesn't help with Claude.ai

For Claude's custom connectors, the connection to the MCP server starts in Anthropic's cloud, not on your computer. [Anthropic's help center](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) says:

> When you add a custom connector, Claude connects to your remote MCP server from Anthropic's cloud infrastructure, rather than from your local device.

And:

> Servers hosted on a private corporate network, behind a VPN, or blocked by a firewall won't connect, even if you can reach them from your own machine.

A program on your computer that turns this stdio server into an HTTP one would still be reachable only from your computer, or your network. For Anthropic's cloud to reach it, you would have to publish it on the public internet, open to anyone who finds the address: the server has no authentication. These docs give no recipe for that. The other clients below also take the URL of a server that their vendor's cloud connects to.

## OpenAI's Secure MCP Tunnel

OpenAI documents another path. Its [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) runs a `tunnel-client` inside your network that "opens an outbound HTTPS path to OpenAI", so that ChatGPT developer mode or the Responses API can call a private MCP server, a stdio one included, without making it public. It needs a tunnel and tunnel permissions in an OpenAI Platform organization. These docs have not tried it with this server and give no setup for it.

## Which clients are remote-only

| Client                                                                        | Vendor    | Use instead                                                                                       |
| ----------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| [Claude.ai custom connectors](#claudeai-custom-connectors)                    | Anthropic | [Claude Desktop](claude-desktop.md) or [Claude Code](claude-code.md)                              |
| [ChatGPT on the web](#chatgpt-on-the-web)                                     | OpenAI    | [ChatGPT desktop app or Codex](chatgpt-desktop-and-codex.md)                                      |
| [OpenAI hosted MCP tools](#openai-hosted-mcp-tools)                           | OpenAI    | [`MCPServerStdio` in the OpenAI Agents SDK](../agent-sdks.md#openai-agents-sdk-python)            |
| [Vibe Work (formerly Le Chat)](#vibe-work-formerly-le-chat)                   | Mistral   | [Mistral Vibe Code](mistral-vibe-code.md)                                                         |
| [Mistral Studio Connectors](#mistral-studio-connectors)                       | Mistral   | [The Mistral Python SDK](../agent-sdks.md#mistral-python-sdk)                                     |
| [Gemini API remote MCP](#gemini-api-remote-mcp)                               | Google    | [google-genai](../agent-sdks.md#google-genai-python-experimental), or [Gemini CLI](gemini-cli.md) |
| [Gemini app (gemini.google.com)](#gemini-app-geminigooglecom), not documented | Google    | [Gemini CLI or Gemini Code Assist](gemini-cli.md)                                                 |

## Claude.ai custom connectors

Custom connectors add a remote MCP server to Claude by URL, on claude.ai, in the mobile apps, in Cowork and in Claude Desktop. [Anthropic's help center](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) says:

> This means your MCP server must be reachable over the public internet from Anthropic's IP ranges.

The same page says that local servers configured in `claude_desktop_config.json` "aren't available in Cowork or claude.ai".

Use instead: [Claude Desktop](claude-desktop.md), with this server in `claude_desktop_config.json` rather than as a custom connector, or [Claude Code](claude-code.md).

## ChatGPT on the web

ChatGPT on the web (chatgpt.com) adds MCP servers in developer mode, as a "developer-mode app for your remote MCP server". [OpenAI's developer mode guide](https://developers.openai.com/api/docs/guides/developer-mode) says:

> Supported MCP protocols: SSE and streaming HTTP.

[OpenAI's Secure MCP Tunnel](#openais-secure-mcp-tunnel) is the exception described [above](#openais-secure-mcp-tunnel); these docs don't cover it.

Use instead: the [ChatGPT desktop app, Codex CLI or the Codex IDE extension](chatgpt-desktop-and-codex.md), which start this server on your machine. That page explains [why ChatGPT on the web cannot](chatgpt-desktop-and-codex.md#chatgpt-on-the-web).

## OpenAI hosted MCP tools

In the OpenAI Agents SDK, `HostedMCPTool` lets OpenAI's Responses API call an MCP server for you, given its `server_url`. The [SDK docs](https://openai.github.io/openai-agents-python/mcp/) describe it as the choice to "call a publicly reachable MCP server on the model's behalf", and say:

> Hosted tools push the entire tool round-trip into OpenAI's infrastructure.

The Secure MCP Tunnel guide also gives the Responses API's MCP tool a `tunnel_id` (see [above](#openais-secure-mcp-tunnel)); the Agents SDK page doesn't mention it, and these docs don't cover it.

Use instead: `MCPServerStdio`, which starts this server from your agent code, in [Python](../agent-sdks.md#openai-agents-sdk-python) or [JavaScript](../agent-sdks.md#openai-agents-sdk-javascript).

## Vibe Work (formerly Le Chat)

Vibe Work, Mistral's web and mobile assistant, adds a custom MCP connector by its server URL, and an administrator has to add it. The troubleshooting section of [Mistral's MCP connectors page](https://docs.mistral.ai/vibe/work/connectors/mcp-connectors) says:

> Server reachability: the server must be accessible over HTTPS with a valid TLS certificate.

Use instead: [Mistral Vibe Code](mistral-vibe-code.md), the CLI or its VS Code extension.

## Mistral Studio Connectors

Studio Connectors register an MCP server once, then use it as a tool from the Mistral API and SDKs. They are a [Public Preview feature](https://docs.mistral.ai/studio/connectors). [Managing Connectors](https://docs.mistral.ai/studio/connectors/management) says:

> Register a new MCP Connector by providing a name, an MCP server URL, and a visibility scope.

Use instead: the [Mistral Python SDK](../agent-sdks.md#mistral-python-sdk), whose `MCPClientSTDIO` starts this server from your code.

## Gemini API remote MCP

The Gemini API's Interactions API connects to a remote MCP server given its URL in the tools configuration. Google's [function calling guide](https://ai.google.dev/gemini-api/docs/function-calling) says:

> Server types: Remote MCP only works with Streamable HTTP servers.

Use instead: the google-genai SDK, which passes a local MCP session to the model, an experimental feature, in [Python](../agent-sdks.md#google-genai-python-experimental) or [JavaScript](../agent-sdks.md#google-genai-javascript-experimental). Or [Gemini CLI](gemini-cli.md).

## Gemini app (gemini.google.com)

The Gemini app, on the web and in its mobile and desktop apps: no official MCP documentation found (2026-10-05). So these docs list the Gemini app as not documented, not as unsupported.

This check was limited. We read the [Gemini Apps Help](https://support.google.com/gemini/) home page and five of its articles, and none of them mentions MCP or the Model Context Protocol:

- [Use & manage Connected Apps in Gemini](https://support.google.com/gemini/answer/13695044)
- [About personalization with Connected Apps](https://support.google.com/gemini/answer/16836988)
- [Use the Gemini app on Mac](https://support.google.com/gemini/answer/17011627)
- [Use Gemini Spark with the Gemini app on Mac](https://support.google.com/gemini/answer/17208717)
- [Use the Gemini app for Windows](https://support.google.com/gemini/answer/18263854)

We could not run a full-text search of the Help Center: its search page loads its results with JavaScript, which our check could not run. Another page of it may describe MCP.

Use instead: [Gemini CLI or Gemini Code Assist](gemini-cli.md).

## Sources

- Get started with custom connectors using remote MCP (Claude Help Center): https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- ChatGPT developer mode (OpenAI): https://developers.openai.com/api/docs/guides/developer-mode
- Secure MCP Tunnel (OpenAI): https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- OpenAI Agents SDK (Python), Model Context Protocol, hosted MCP server tools: https://openai.github.io/openai-agents-python/mcp/
- Vibe Work, MCP Connectors (Mistral): https://docs.mistral.ai/vibe/work/connectors/mcp-connectors
- Studio, Connectors (Mistral): https://docs.mistral.ai/studio/connectors
- Studio, Managing Connectors (Mistral): https://docs.mistral.ai/studio/connectors/management
- Gemini API, function calling, Remote MCP (Google): https://ai.google.dev/gemini-api/docs/function-calling
- Gemini Apps Help (Google), home page and the five articles listed under [Gemini app](#gemini-app-geminigooglecom), read for MCP (no full-text search): https://support.google.com/gemini/

Last verified: 2026-10-05 against official docs
