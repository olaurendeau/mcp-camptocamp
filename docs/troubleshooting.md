# Troubleshooting

Start with the [smoke test](getting-started.md#smoke-test): if it prints the server's version and `13`, the server works on this machine and the problem is in the client's configuration.

## The server times out on its first start

**Symptom:** the first time a client starts the server, it gives up (a startup timeout, or a server marked as failed), and later starts work.

**Cause:** the first `npx -y` run downloads the npm package, and the first `docker run` pulls the image. A client waits only a limited time for a server to start: Codex and Mistral Vibe Code wait 10 seconds by default.

**Fix:** download it once before starting the client, as shown in [Pre-warm the first start](getting-started.md#pre-warm-the-first-start):

```sh
docker pull ghcr.io/olaurendeau/mcp-camptocamp:latest
```

or run `npx -y @olaurendeau/mcp-camptocamp` once in a terminal, then press Ctrl+C.

Or raise the client's startup timeout:

- Codex and the ChatGPT desktop app: `startup_timeout_sec` (seconds, default 10) in the server's table of `~/.codex/config.toml`:

  ```toml
  [mcp_servers.camptocamp]
  command = "npx"
  args = ["-y", "@olaurendeau/mcp-camptocamp"]
  startup_timeout_sec = 30
  ```

- Mistral Vibe Code: `startup_timeout_sec` (seconds, default 10) in the server's `[[mcp_servers]]` entry of `config.toml`:

  ```toml
  [[mcp_servers]]
  name = "camptocamp"
  transport = "stdio"
  command = "npx"
  args = ["-y", "@olaurendeau/mcp-camptocamp"]
  startup_timeout_sec = 30
  ```

- Claude Code: the `MCP_TIMEOUT` environment variable, in milliseconds, for example `MCP_TIMEOUT=30000 claude`.

## The server is older than expected, or `lang` is ignored

**Symptom:** the tools have no `lang` input and answers stay in French, or the [smoke test](getting-started.md#smoke-test) prints a version below 1.3.0. The `lang` input needs v1.3.0 or later.

**Cause:** the server needs Node.js 22 or later. With an older Node.js, `npx -y @olaurendeau/mcp-camptocamp` prints no error: npx installs the newest release that still accepts that Node.js version. Tried on 2026-10-04 with the older Node.js versions 18 and 20, npx ran v1.2.0, which has no `lang` input.

**Fix:** check the version with `node --version`, and install [Node.js](https://nodejs.org/en/download) 22 or later. Or use the [Docker variant](getting-started.md#quick-start-docker): the image includes its own Node.js.

## Docker: the server stops right after it starts

**Symptom:** with the Docker variant, the client reports that the server closed or failed to connect, and running the command in a terminal returns at once without output.

**Cause:** `-i` is missing. Docker then does not keep the container's standard input open, so the server reads no client message and exits.

**Fix:** put `-i` before the image name:

```sh
docker run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:latest
```

In a JSON configuration, `args` is `["run", "--rm", "-i", "ghcr.io/olaurendeau/mcp-camptocamp:latest"]`.

## Gemini CLI shows the server as Disabled or Disconnected

**Symptom:** `gemini mcp list` shows `camptocamp` as "Disconnected", as the Gemini CLI documentation describes it, or as `Disabled`, as Gemini CLI 0.62.0 does (tried on 2026-10-05). 0.62.0 also prints "MCP servers are configured but disabled because this folder is untrusted".

**Cause:** for security, Gemini CLI starts a stdio server (one with a `command`) only when the current folder is trusted. In an untrusted folder, MCP servers do not connect, the ones in your user settings included.

**Fix:** trust the folder you start Gemini CLI from:

- start Gemini CLI there and choose **Trust folder** in the trust dialog;
- or run `/permissions` inside Gemini CLI to change the folder's trust;
- or, for one session only, start it with `--skip-trust` or with `GEMINI_CLI_TRUST_WORKSPACE=true`.

The Gemini CLI MCP documentation says to run `gemini trust`, but Gemini CLI 0.62.0 has no such command: `gemini trust` sends "trust" as the first prompt of a new session. See [Trust the folder](clients/gemini-cli.md#trust-the-folder) on the Gemini CLI page.

## Claude Desktop does not show the server

**Symptom:** after editing `claude_desktop_config.json`, `camptocamp` is not in Claude Desktop's connectors.

**Fix:**

1. Quit Claude Desktop completely, then open it again: it needs a restart to load the configuration.
2. Check that the file is valid JSON, with the `camptocamp` entry inside `mcpServers` (see [Other MCP clients](getting-started.md#other-mcp-clients)).
3. Read the logs. `mcp.log` covers connections and connection failures; `mcp-server-camptocamp.log` holds what the server writes to stderr.
   - macOS: `~/Library/Logs/Claude`. Follow them with `tail -n 20 -f ~/Library/Logs/Claude/mcp*.log`.
   - Windows: `%APPDATA%\Claude\logs`. List them with `type "%APPDATA%\Claude\logs\mcp*.log"`.
4. Run the server's command in a terminal (the [smoke test](getting-started.md#smoke-test)) to see its errors.

## Windows: ENOENT and `${APPDATA}` in the Claude Desktop logs

**Symptom:** the server fails to load, and its log shows an `ENOENT` error with `${APPDATA}` in a path.

**Fix:** the MCP documentation says: "you may need to add the expanded value of %APPDATA% to your env key in claude_desktop_config.json". Replace `<you>` with your Windows user name:

```json
{
  "mcpServers": {
    "camptocamp": {
      "command": "npx",
      "args": ["-y", "@olaurendeau/mcp-camptocamp"],
      "env": {
        "APPDATA": "C:\\Users\\<you>\\AppData\\Roaming\\"
      }
    }
  }
}
```

Then start Claude Desktop again. If npx still fails, check that npm is installed globally: the folder `%APPDATA%\npm` exists. If not, run `npm install -g npm`.

## Claude Code warns that a tool's output is large

**Symptom:** Claude Code warns about the size of a tool's output, or cuts it.

**Cause:** Claude Code warns when an MCP tool's output exceeds 10,000 tokens, and by default caps it at 25,000 tokens.

**Fix:** ask for fewer results per call (the search tools take a `limit`), or raise the cap with the `MAX_MCP_OUTPUT_TOKENS` environment variable, for example `MAX_MCP_OUTPUT_TOKENS=50000 claude`. The warning threshold cannot be changed.

## Check that a client sees the server

| Client              | Inside the client                                                  | From a terminal                                      |
| ------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| Claude Code         | `/mcp`                                                             | `claude mcp list`                                    |
| Codex CLI           | `/mcp`                                                             | `codex mcp list`                                     |
| ChatGPT desktop app | Settings > MCP servers, or `/mcp` in the composer                  | `codex mcp list`, if Codex CLI is installed (\*)     |
| Gemini CLI          | `/mcp`                                                             | `gemini mcp list`                                    |
| Mistral Vibe Code   | `/mcp`, or `/mcp camptocamp` for its tools                         | none documented                                      |
| Claude Desktop      | "Add files, connectors, and more" > Connectors > Manage connectors | the [logs](#claude-desktop-does-not-show-the-server) |

(\*) The ChatGPT desktop app, Codex CLI and the Codex IDE extension share one MCP configuration (`~/.codex/config.toml` by default), so `codex mcp list` shows the servers added in the app ([OpenAI docs](https://learn.chatgpt.com/docs/extend/mcp)).

## Sources

- Claude Desktop: https://modelcontextprotocol.io/docs/develop/connect-local-servers
- Claude Code: https://code.claude.com/docs/en/mcp
- Codex and the ChatGPT desktop app: https://learn.chatgpt.com/docs/extend/mcp
- Mistral Vibe Code: https://docs.mistral.ai/vibe/code/cli/mcp-servers and https://github.com/mistralai/mistral-vibe
- Gemini CLI: https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md and, for folder trust, https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md
- docker run: https://docs.docker.com/reference/cli/docker/container/run/

Last verified: 2026-10-04 against official docs
