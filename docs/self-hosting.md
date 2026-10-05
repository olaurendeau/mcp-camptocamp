# Self-hosting over HTTP

Run your own instance of this server on the internet, behind a secret token, so that clients that only connect to remote servers by URL, such as Claude.ai custom connectors and Vibe Work, can use it.

**The HTTP mode needs v1.4.0 or later.** v1.3.0 and older ignore the `MCP_*` variables of this page: they start over stdio, find no input, and exit at once with code 0 and no message, so `--restart unless-stopped` restarts them in a loop and `/healthz` never answers. [Check it](#check-it) prints the version you run.

Replace `mcp.example.org` with your own domain everywhere on this page.

## What you get and who it is for

This guide is for one person or a small team hosting one instance for themselves. You get:

- An MCP endpoint at `https://mcp.example.org/mcp`, over Streamable HTTP, with the same tools, input schemas and tool output as the stdio server. It is stateless and answers each request with plain JSON.
- A secret bearer token on every request. The server refuses to start without one, and answers 401 to a request without a valid one.
- A health endpoint, `/healthz`, for your orchestrator or monitoring.
- [One log line per request](#read-the-logs), without tool arguments, tokens, query strings or client IP addresses.
- A cap on the requests sent to the Camptocamp API: at most 4 at a time by default, whatever the number of clients.

Which clients can connect, and how each sends the token:

| Client                                                            | Token                                                                    | Setup                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| Claude.ai custom connectors (web, mobile, Cowork, Claude Desktop) | Typed in the connector's Request headers (beta, not every organization)  | [Claude.ai](#claudeai-custom-connectors)              |
| Vibe Work (formerly Le Chat)                                      | Auto-detected by Vibe Work; Mistral doesn't say where the token is typed | [Vibe Work](#vibe-work-formerly-le-chat)              |
| Claude Code                                                       | `headers` with `${VAR}`                                                  | [Claude Code](#claude-code)                           |
| Codex CLI and Codex IDE extension                                 | `bearer_token_env_var`                                                   | [Codex](#codex)                                       |
| Gemini CLI                                                        | `headers` with `$VAR`                                                    | [Gemini CLI](#gemini-cli)                             |
| Mistral Vibe Code                                                 | `api_key_env`                                                            | [Mistral Vibe Code](#mistral-vibe-code)               |
| ChatGPT on the web                                                | Not supported: it cannot send a token                                    | [ChatGPT on the web](#chatgpt-on-the-web-unsupported) |

Claude Code, Codex, Gemini CLI and Vibe Code can also start the server on your machine over stdio, with nothing to host: see [Clients](README.md#clients). Connect them to an instance to share it, or to use the one you already run.

You need:

- a domain name whose DNS record points to your host;
- a host reachable from the internet on ports 80 and 443: Caddy uses both to get its certificate, and the vendors' clouds connect on 443;
- Docker, or [Node.js](https://nodejs.org/en/download) 22 or later for npx.

## Create a token

On the host, in the folder you will run the server from:

```sh
(umask 077; printf 'MCP_AUTH_TOKENS=%s\nMCP_OPERATOR_CONTACT=ops@example.org\n' "$(openssl rand -hex 32)" > camptocamp.env)
ls -l camptocamp.env
```

`ls -l` shows `-rw-------`: only your user can read the file. `openssl rand -hex 32` "generates num random bytes using a cryptographically secure pseudo random number generator", here 32 bytes printed as 64 hexadecimal characters. Replace `ops@example.org` with an address where Camptocamp can reach you (see [Using a volunteer-run API responsibly](#using-a-volunteer-run-api-responsibly)).

The server refuses a token shorter than 32 characters, or with a character a bearer token cannot hold, and names it by its position in the list, never by its value.

For a small team, give each person their own token: `MCP_AUTH_TOKENS` takes a comma-separated list.

```sh
(umask 077; printf 'MCP_AUTH_TOKENS=%s,%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > camptocamp.env)
```

The log shows the position of the token each request used (`"token":2`), never the token. To revoke one person, remove their token from the list and recreate the container.

Never commit `camptocamp.env` and never send a token with the URL. Hand each person their token through a password manager or another private channel.

## Run with Docker

Load the file into your shell, then start the container:

```sh
set -a; . ./camptocamp.env; set +a
docker run -d --restart unless-stopped --name camptocamp \
  -e MCP_TRANSPORT=http \
  -e MCP_AUTH_TOKENS \
  -e MCP_ALLOWED_HOSTS=mcp.example.org \
  -e MCP_OPERATOR_CONTACT \
  -p 127.0.0.1:3000:3000 \
  --read-only --cap-drop ALL \
  ghcr.io/olaurendeau/mcp-camptocamp:latest
```

- `-e MCP_AUTH_TOKENS`, with no `=value`: the [docker run reference](https://docs.docker.com/reference/cli/docker/container/run/) says "the Docker CLI client checks the value the variable has in your local environment and passes it to the container". The token stays out of the command line and your shell history. Like any environment variable, it is still stored in the container's configuration: anyone who can run `docker inspect` on this host can read it.
- `-p 127.0.0.1:3000:3000` publishes the port on the host's loopback only, so the reverse proxy on the same host is the only way in. Inside the container the image listens on all interfaces.
- `--read-only --cap-drop ALL`: the server writes no file and needs no Linux capability. The image runs as the `node` user.
- `MCP_ALLOWED_HOSTS=mcp.example.org` is the public name, which the reverse proxy passes on (see [TLS with Caddy](#tls-with-caddy)). It replaces the default `localhost` list, so `curl http://127.0.0.1:3000/mcp` on the host gets a 403: check the server through its public URL.

`docker logs camptocamp` starts with one line like this (`"tokens"` is the number of tokens, never their value):

```json
{
  "message": "listening",
  "transport": "http",
  "host": "0.0.0.0",
  "port": 3000,
  "path": "/mcp",
  "allowed_hosts": ["mcp.example.org"],
  "allowed_origins": [],
  "tokens": 1,
  "upstream_concurrency": 4,
  "version": "1.4.0"
}
```

The server prints it on a single line; it is spread out here to be read.

To stop the server:

```sh
docker stop -t 10 camptocamp
```

On SIGTERM the server stops accepting connections, lets requests in flight finish for up to 8 seconds, and exits with code 0. `-t 10` gives it 10 seconds before Docker sends SIGKILL: Docker Desktop's default was seen to be shorter than the 8-second drain.

### With Docker Compose

Put this `compose.yaml` next to `camptocamp.env`:

```yaml
services:
  camptocamp:
    image: ghcr.io/olaurendeau/mcp-camptocamp:latest
    restart: unless-stopped
    env_file: camptocamp.env
    environment:
      MCP_TRANSPORT: http
      MCP_ALLOWED_HOSTS: mcp.example.org
    ports:
      - "127.0.0.1:3000:3000"
    read_only: true
    cap_drop:
      - ALL
    stop_grace_period: 10s
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

Then start it with `docker compose up -d`. `docker compose ps` shows the service as `(healthy)` once the first check passes.

- `env_file` reads the token from `camptocamp.env`, so `compose.yaml` holds no secret and needs no `set -a` first.
- `stop_grace_period: 10s` does what `docker stop -t 10` does above.
- The healthcheck runs the `wget` of the image's Alpine base inside the container, without a token. `/healthz` answers 503 while the server shuts down. The image has no healthcheck of its own, because clients on your desktop run the same image over stdio. Each check adds a `/healthz` line to the log.

## Run with npx

With Node.js 22 or later, run the npm package with the same variables:

```sh
set -a; . ./camptocamp.env; set +a
MCP_TRANSPORT=http MCP_ALLOWED_HOSTS=mcp.example.org npx -y @olaurendeau/mcp-camptocamp
```

Without the Docker image, the server listens on `127.0.0.1` port 3000 by default, the address the reverse proxy below forwards to. It runs in the foreground: Ctrl+C or SIGTERM drains it and exits 0. Keep it running with your usual process manager.

## Settings

| Variable                   | Default                                                               | Meaning                                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_TRANSPORT`            | `stdio`                                                               | `http` turns the HTTP mode on.                                                                                                                                                    |
| `MCP_AUTH_TOKENS`          | none, required                                                        | Comma-separated tokens, each at least 32 characters among letters, digits and `-._~+/`, with optional trailing `=`.                                                               |
| `MCP_ALLOWED_HOSTS`        | `localhost`, `127.0.0.1` and `[::1]`, each with and without `:<port>` | Comma-separated `Host` values accepted on `/mcp`. Setting it replaces the defaults.                                                                                               |
| `MCP_ALLOWED_ORIGINS`      | none                                                                  | Comma-separated origins, such as `https://app.example.org`, accepted when a request has an `Origin` header. A request without one passes; with an empty list, any other gets 403. |
| `MCP_HTTP_HOST`            | `127.0.0.1`, or `0.0.0.0` in the Docker image                         | Address to listen on.                                                                                                                                                             |
| `MCP_HTTP_PORT`            | `3000`                                                                | Port to listen on, 1 to 65535.                                                                                                                                                    |
| `MCP_UPSTREAM_CONCURRENCY` | `4`                                                                   | Camptocamp requests in flight at once for the whole instance, 1 to 8.                                                                                                             |
| `MCP_OPERATOR_CONTACT`     | none                                                                  | Your contact, added to the User-Agent sent to Camptocamp. Printable ASCII without `(`, `)`, `;` or `\`, at most 100 characters.                                                   |

An empty variable counts as unset. A wrong value stops the server at startup with exit code 1 and a message naming the variable. Without `MCP_TRANSPORT=http`, the server runs over stdio and reads none of the others.

Fixed limits:

- A request body over 64 KiB gets 413.
- A request still unanswered after 90 seconds gets 504, `Request timed out after 90 s`.
- When the tools need more Camptocamp requests at once than the cap allows, the extra requests wait in line: at most 50 of them, each for at most 20 seconds. Past either limit, the tool answers `Error: this server is busy (too many Camptocamp requests in progress); try again shortly.` and nothing is retried.

## TLS with Caddy

The vendors' clouds connect over HTTPS only, with a valid certificate. [Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy) gets and renews one for you. With Caddy installed on the same host, write this `Caddyfile`:

```caddyfile
mcp.example.org
reverse_proxy 127.0.0.1:3000
```

Then run `caddy run` from the same folder, or reload Caddy if it already runs as a service. Caddy's quick start lists what it needs to get a publicly trusted certificate: "make sure your DNS records point to your machine and that ports 80 and 443 are open to the public and directed toward Caddy."

- **Host.** "By default, Caddy passes through incoming headers—including `Host`—to the backend without modifications." The server sees `Host: mcp.example.org`, which is why `MCP_ALLOWED_HOSTS` is the public name. A proxy that rewrites `Host` needs the rewritten value instead: the 403 log line shows it.
- **Buffering.** The server answers with plain JSON and a `Content-Length`, never with a stream, so Caddy needs no buffering or flushing setting.
- **127.0.0.1.** These two lines assume Caddy runs on the host itself. In a container, `127.0.0.1` is that container, not the host.

## Check it

From any machine, with your token in the `CAMPTOCAMP_MCP_TOKEN` environment variable. To set it without printing it or keeping it in your shell history, run this and paste the token:

```sh
read -rs CAMPTOCAMP_MCP_TOKEN && export CAMPTOCAMP_MCP_TOKEN
```

On the host, after `set -a; . ./camptocamp.env; set +a`, `export CAMPTOCAMP_MCP_TOKEN="${MCP_AUTH_TOKENS%%,*}"` takes the first token of the list.

The health endpoint needs no token:

```sh
curl -sS https://mcp.example.org/healthz
```

```text
{"status":"ok"}
```

A request without a token gets 401:

```sh
curl -sS -i -X POST https://mcp.example.org/mcp
```

```text
HTTP/2 401
content-type: application/json
via: 1.1 Caddy
www-authenticate: Bearer realm="mcp-camptocamp"

{"jsonrpc":"2.0","error":{"code":-32001,"message":"Unauthorized"},"id":null}
```

Some header lines are left out. With a token that matches none, the header adds `error="invalid_token"`.

`initialize` with your token:

```sh
curl -sS https://mcp.example.org/mcp \
  -H "Authorization: Bearer $CAMPTOCAMP_MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

The answer holds `"serverInfo":{"name":"mcp-camptocamp","version":"1.4.0"}` and the server's instructions. Clients must send both types in `Accept`: without it, the server answers 406.

One tool call, which sends one request to Camptocamp:

```sh
curl -sS https://mcp.example.org/mcp \
  -H "Authorization: Bearer $CAMPTOCAMP_MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_waypoints","arguments":{"query":"Aiguille Verte","limit":1}}}'
```

The text of the result starts like this, captured from v1.4.0 on 2026-10-05:

```text
Found 9 waypoint(s). Showing 1 from offset 0:
Filters: query "Aiguille Verte"

- [38615] Aiguille Verte (summit) | 4122m
```

## Read the logs

`docker logs camptocamp` (or `docker compose logs`) shows one JSON line per request after the startup line. The server writes them to stderr. For example:

```json
{
  "time": "2026-10-05T11:30:51.526Z",
  "method": "POST",
  "path": "/mcp",
  "status": 200,
  "duration_ms": 297,
  "rpc": "tools/call",
  "tool": "search_waypoints",
  "result": "ok",
  "upstream_requests": 1,
  "token": 1
}
```

| Field                              | Meaning                                                                                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `time`                             | When the request ended, in UTC (ISO 8601).                                                                                                                                                                                                                                           |
| `method`                           | The HTTP method.                                                                                                                                                                                                                                                                     |
| `path`                             | `/mcp`, `/mcp/` or `/healthz`. Any other path is logged as `"other"`, because a path can hold a secret.                                                                                                                                                                              |
| `status`                           | The HTTP status. `499` means the response never fully reached the client (nginx's "client closed request"): the client left, or the server cut a response the client had stopped reading, at the 90-second timeout or the shutdown deadline. The server never sends 499 to a client. |
| `duration_ms`                      | Time from the request's arrival to the end of its response, in milliseconds.                                                                                                                                                                                                         |
| `rpc`                              | The JSON-RPC method, `batch`, or `invalid` when it is not a plain name; `null` when no JSON body was read: the request was refused before its body was read, or the body was not valid JSON.                                                                                         |
| `tool`                             | The tool of a `tools/call`, or `invalid` when its name is not a plain name; `null` otherwise.                                                                                                                                                                                        |
| `result`                           | `ok`; `tool_error` when the tool answered with an error, such as a Camptocamp error or the busy message; `rejected` for a status of 400 or more or a JSON-RPC error.                                                                                                                 |
| `upstream_requests`                | How many requests this request sent to Camptocamp.                                                                                                                                                                                                                                   |
| `token`                            | The position of the matching token in `MCP_AUTH_TOKENS`, or `null`.                                                                                                                                                                                                                  |
| `rejected_host`, `rejected_origin` | On a 403 only: the refused `Host` or `Origin` value, cut to 200 characters.                                                                                                                                                                                                          |

The log never holds request bodies, tool arguments, query strings, responses, tokens or client IP addresses.

Lines that look like errors but are expected:

- `"method":"GET","path":"/mcp","status":405` right after an `initialize`: the client asked for the optional event stream, which this stateless server does not offer. Claude Code and Gemini CLI do it.
- `"rpc":"server/discover"` with status 400, then an `initialize`: a client on a newer MCP revision tries its new handshake first, then falls back to `initialize`. Claude Code 2.1.289 does it.
- A `/healthz` line every 30 seconds: the compose healthcheck.

## Connect each client

The URL is `https://mcp.example.org/mcp`. Each snippet below reads the token from `CAMPTOCAMP_MCP_TOKEN` in the environment the client starts from: set it with `read -rs` as in [Check it](#check-it), or in your shell profile or secret manager, never in a file you commit.

### Claude.ai custom connectors

Claude.ai connects from Anthropic's cloud, not from your device, so the URL must be reachable from the public internet; Anthropic's outbound range is `160.79.104.0/21`. Add the connector:

- On a Free, Pro or Max plan: **Customize > Connectors**, then **Add custom connector**.
- On a Team or Enterprise plan: an Owner adds it in **Organization settings > Connectors**, with **Add**, then **Custom > Web**. Each member then connects it from **Customize > Connectors**.

In the dialog:

1. Enter a name, such as `camptocamp`, and the URL `https://mcp.example.org/mcp`.
2. Under **Authentication**, choose **No sign-in**. Anthropic's docs: "If the server uses an API key, choose No sign-in and add the key under Request headers."
3. Under **Request headers**, choose the header name `authorization`, enter `Bearer `, a space, then your token, and mark it **Required**. "Claude sends the value exactly as you enter it. It doesn't add an authentication scheme or any other prefix."
4. Click **Add**.

Limits, from Anthropic's docs:

- "Request header authentication is in beta and available to a limited set of organizations. If you don't see the Request headers section in the Add custom connector dialog, your organization doesn't have access yet." Without it, Claude.ai cannot use this server, which has no OAuth.
- On a Team or Enterprise plan, "everyone who uses the connector reaches the service with that same credential": one token for the whole organization, logged under one position.
- "You can't change authentication settings after you add a connector." To change the token, remove the connector and add it again.

Not yet tried with a real Claude.ai account (2026-10-05): these steps come from Anthropic's docs only.

### Vibe Work (formerly Le Chat)

Only an administrator can add a custom connector; "On Free, Pro, and Student plans, the account owner is the administrator by default." On the **Connectors** page, click **+ Add Connector**, switch to the **Custom MCP Connector** tab, enter a Connector name (no spaces or special characters) and the URL `https://mcp.example.org/mcp`, then click **Connect**.

Mistral says "The platform detects the server's authentication method automatically", and lists "HTTP Bearer Token / Basic Auth: for servers that require credentials in the Authorization header" among the methods. Its docs don't say where you type the token. Its troubleshooting also says "OAuth servers should return a 401 with a WWW-Authenticate header", and this server's 401 has `WWW-Authenticate: Bearer realm="mcp-camptocamp"`, with no OAuth metadata (its `/.well-known/` paths answer 404). Whether Vibe Work then asks for a bearer token was not yet tried (2026-10-05).

Mistral's "Quick checks with curl" don't fit this server: `curl -I` and a GET with the token get 405, since `/mcp` takes POST only, and its `initialize` example has no `Accept` header or `clientInfo`. Use [Check it](#check-it) instead.

After setup, each user can turn on **Always allow** per function, in the connector's **Functions** tab. Every tool of this server only reads public Camptocamp data.

### Claude Code

Add the instance for your user, in every project:

```sh
claude mcp add --transport http --scope user camptocamp https://mcp.example.org/mcp \
  --header 'Authorization: Bearer ${CAMPTOCAMP_MCP_TOKEN}'
```

The single quotes keep `${CAMPTOCAMP_MCP_TOKEN}` as written: Claude Code stores the reference and expands it each time it connects. With double quotes, your shell would write the token itself into `~/.claude.json`.

To share the entry with a project, put it in `.mcp.json` instead: it holds no token, and Claude Code expands `${VAR}` in `headers`.

```json
{
  "mcpServers": {
    "camptocamp": {
      "type": "http",
      "url": "https://mcp.example.org/mcp",
      "headers": {
        "Authorization": "Bearer ${CAMPTOCAMP_MCP_TOKEN}"
      }
    }
  }
}
```

`claude mcp get camptocamp` shows `Status: ✔ Connected`. With the variable unset, it shows `✘ Failed to connect` and "Server rejected the configured Authorization header (HTTP 401)". Don't reuse one of Claude Code's own credential variables, such as `ANTHROPIC_API_KEY`: in a remote server's `headers`, Claude Code "reads credential variables from your environment as empty".

The allow rule `mcp__camptocamp` works as for the stdio server: see [Allow the tools without prompts](clients/claude-code.md#allow-the-tools-without-prompts).

Tried on 2026-10-05 with Claude Code 2.1.289 against v1.4.0: the `--scope user` entry connected, and a print-mode session called `search_waypoints` through it.

### Codex

```sh
codex mcp add camptocamp --url https://mcp.example.org/mcp --bearer-token-env-var CAMPTOCAMP_MCP_TOKEN
```

OpenAI's MCP page documents the `bearer_token_env_var` key but not this flag; Codex CLI 0.160.0 accepted it and wrote this entry to `~/.codex/config.toml`, which you can also add by hand:

```toml
[mcp_servers.camptocamp]
url = "https://mcp.example.org/mcp"
bearer_token_env_var = "CAMPTOCAMP_MCP_TOKEN"
```

`bearer_token_env_var` is the "Environment variable name for a bearer token to send in `Authorization`". `codex mcp list` shows `Bearer token` in its Auth column. The Codex IDE extension and the ChatGPT desktop app read the same file; whether the desktop app sees your environment variable depends on how it is started, which OpenAI doesn't document.

Tried on 2026-10-05 with Codex CLI 0.160.0 for the configuration only: `codex mcp list` does not connect to the server, and no session was run.

### Gemini CLI

```sh
gemini mcp add --scope user --transport http --header 'Authorization: Bearer ${CAMPTOCAMP_MCP_TOKEN}' camptocamp https://mcp.example.org/mcp
```

The single quotes keep the reference as written in `~/.gemini/settings.json`; Gemini CLI 0.62.0 writes it with `url` and `"type": "http"`. Google's docs describe the same entry with `httpUrl`:

```json
{
  "mcpServers": {
    "camptocamp": {
      "httpUrl": "https://mcp.example.org/mcp",
      "headers": {
        "Authorization": "Bearer $CAMPTOCAMP_MCP_TOKEN"
      }
    }
  }
}
```

Google's configuration reference says string values in `settings.json` "can reference environment variables using `$VAR_NAME`, `${VAR_NAME}`". Its MCP page, about the same expansion in a server's `env`, says an unset variable "resolves to an empty string"; with `CAMPTOCAMP_MCP_TOKEN` empty, Gemini CLI 0.62.0 got a 401 from the server and showed it as `Disconnected`.

Gemini CLI connects to MCP servers only in a trusted folder, user-level ones included: see [Trust the folder](clients/gemini-cli.md#trust-the-folder). Then `gemini mcp list` shows `✓ camptocamp: https://mcp.example.org/mcp (http) - Connected`. To stop the confirmation prompts, use the [policy rule](clients/gemini-cli.md#stop-the-confirmation-prompts) of the Gemini CLI page.

Tried on 2026-10-05 with Gemini CLI 0.62.0 against v1.4.0: both forms connected (`gemini mcp list`); no session was run.

### Mistral Vibe Code

Append this to `~/.vibe/config.toml`:

```toml
[[mcp_servers]]
name = "camptocamp"
transport = "http"
url = "https://mcp.example.org/mcp"
api_key_env = "CAMPTOCAMP_MCP_TOKEN"
api_key_header = "Authorization"
api_key_format = "Bearer {token}"
```

To allow the tools without a prompt, add the `[tools.camptocamp_…]` tables of [Allow the tools without a prompt](clients/mistral-vibe-code.md#allow-the-tools-without-a-prompt): the tool names are the same.

Tried on 2026-10-05 with Vibe Code 2.25.1 against v1.4.0: a programmatic session called `search_waypoints` through this entry.

### ChatGPT on the web (unsupported)

ChatGPT on the web cannot use a self-hosted instance. Its developer mode lists "Authentication supported: OAuth, No Authentication, and Mixed Authentication", and OpenAI's Apps SDK says ChatGPT cannot "present custom API keys". This server accepts only its token, and has no OAuth and no open mode.

Use instead:

- the [ChatGPT desktop app or Codex](clients/chatgpt-desktop-and-codex.md), which start the server on your machine, or connect to your instance as in [Codex](#codex);
- OpenAI's [Secure MCP Tunnel](clients/remote-only.md#openais-secure-mcp-tunnel), which these docs don't cover.

## Using a volunteer-run API responsibly

Camptocamp.org is run by volunteers, and its API is free and needs no key. Every tool call sends one or more requests to it, under your instance's name.

- **Set `MCP_OPERATOR_CONTACT`.** In HTTP mode, the User-Agent sent to Camptocamp names this server, its version and its repository, marks the instance as self-hosted, and adds your contact. Camptocamp can then reach you rather than block you.
- **Keep the token private.** Never publish the URL together with a token, never commit `camptocamp.env`, and give each person their own token.
- **Don't raise the cap for bulk use.** `MCP_UPSTREAM_CONCURRENCY` counts every client of the instance together. Keep the default of 4; scraping or bulk exports are not what this server is for.
- **No open mode.** The server refuses to start without a token: an open instance would let anyone send requests to Camptocamp under your name.

## Updating

With `docker run`, pull the new image, remove the container, then start it again with the `docker run` command of [Run with Docker](#run-with-docker), after loading `camptocamp.env`:

```sh
docker pull ghcr.io/olaurendeau/mcp-camptocamp:latest
docker stop -t 10 camptocamp
docker rm camptocamp
```

`docker run` only pulls an image that is missing, so the `docker pull` is needed.

With Docker Compose:

```sh
docker compose pull
docker compose up -d
```

When a service's image changed, `docker compose up` "picks up the changes by stopping and recreating the containers".

With npx, restart the process. Given the bare package name, the npx of npm 10 (bundled with Node.js 22) asks the registry for the latest release at each start and installs it into its npm cache when it is newer. This comes from npm 10.9.9's source, not from npm's docs. If the package is also installed in the current project or globally, npx runs that copy instead.

Then run [Check it](#check-it) again: `initialize` shows the new version.

## Troubleshooting

**The container restarts in a loop, with no log line.** `docker logs camptocamp` is empty and `docker ps` shows `Restarting`: the image is v1.3.0 or older, which has no HTTP mode (see the top of this page). Update it as in [Updating](#updating).

**The server exits at once with a message.** The message names the variable to fix, for example `MCP_AUTH_TOKENS is required when MCP_TRANSPORT=http`, `MCP_AUTH_TOKENS: token 1 is shorter than 32 characters`, or `MCP_HTTP_PORT: port 3000 is already in use on 127.0.0.1`. With Docker, check that `camptocamp.env` was loaded into the shell that ran `docker run`: an unset `-e MCP_AUTH_TOKENS` passes nothing.

**403 `Forbidden: Host not allowed`.** The log line has `rejected_host`. If it is your public name, set `MCP_ALLOWED_HOSTS` to that value and recreate the container. A request to `127.0.0.1:3000` on the host gets this 403 on purpose: use the public URL.

**403 `Forbidden: Origin not allowed`.** The client sent an `Origin` header; the log line has `rejected_origin`. If it is a client you trust, add that value to `MCP_ALLOWED_ORIGINS`. Whether a vendor's cloud sends an `Origin` header was not yet checked (2026-10-05).

**401 `Unauthorized`.** No token arrived, or it matches none (`error="invalid_token"` in `WWW-Authenticate`). Check that `CAMPTOCAMP_MCP_TOKEN` is set in the environment the client starts from, and for Claude.ai that the header value starts with `Bearer` and a space.

**406 `Not Acceptable`.** The client did not send `Accept: application/json, text/event-stream`.

**405 or 404.** `/mcp` takes POST only, so GET, HEAD, DELETE and OPTIONS get 405. Any path other than `/mcp`, `/mcp/` and `/healthz` gets 404: check that the URL ends with `/mcp`.

**A vendor cannot reach the server.** From a machine outside your network, run the `/healthz` and 401 checks of [Check it](#check-it). If they fail, check the DNS record, that ports 80 and 443 reach Caddy, and Caddy's log for certificate errors: Vibe Work, for one, needs "a valid TLS certificate". If they pass but the vendor still fails, look for its requests in the log: no line means they never reached the server.

## Sources

- Claude Help Center, Get started with custom connectors using remote MCP (plans, roles, network requirements): https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Claude docs, Add a connector that isn't in the directory (No sign-in, Request headers, header value, beta): https://claude.com/docs/connectors/custom/add-unlisted
- Claude Platform, IP addresses (outbound range): https://platform.claude.com/docs/en/api/ip-addresses
- Mistral, Vibe Work MCP Connectors (admin, auto-detection, troubleshooting, curl checks): https://docs.mistral.ai/vibe/work/connectors/mcp-connectors
- Claude Code, Connect Claude Code to tools via MCP (`--transport http`, `--header`, `.mcp.json` expansion, credential variables): https://code.claude.com/docs/en/mcp
- Codex, MCP (`codex mcp add`, `bearer_token_env_var`, shared configuration): https://learn.chatgpt.com/docs/extend/mcp
- Gemini CLI, MCP servers (`httpUrl`, `headers`, `gemini mcp add --header`, `gemini mcp list`): https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
- Gemini CLI, configuration (environment variables in `settings.json`): https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- Mistral, Vibe Code MCP servers (`transport = "http"`, `api_key_env`, `api_key_format`): https://docs.mistral.ai/vibe/code/cli/mcp-servers
- OpenAI, ChatGPT developer mode (supported authentication): https://developers.openai.com/api/docs/guides/developer-mode
- OpenAI, Apps SDK authentication (no custom API keys): https://developers.openai.com/apps-sdk/build/auth
- OpenAI, Secure MCP Tunnel: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- OpenSSL, `openssl rand`: https://docs.openssl.org/master/man1/openssl-rand/
- Docker, `docker run` (environment variables): https://docs.docker.com/reference/cli/docker/container/run/
- Docker, `docker stop` (`--timeout`): https://docs.docker.com/reference/cli/docker/container/stop/
- Docker, Compose services reference (`env_file`, `read_only`, `cap_drop`, `stop_grace_period`, `healthcheck`): https://docs.docker.com/reference/compose-file/services/
- Docker, `docker compose up` (recreating containers): https://docs.docker.com/reference/cli/docker/compose/up/
- Caddy, Reverse proxy quick-start (Caddyfile, `caddy run`, DNS and ports): https://caddyserver.com/docs/quick-starts/reverse-proxy
- Caddy, `reverse_proxy` directive (headers passed through, streaming): https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- Caddy, Automatic HTTPS (requirements): https://caddyserver.com/docs/automatic-https
- npm, `npx` (npm cache): https://docs.npmjs.com/cli/v11/commands/npx
- Model Context Protocol, Streamable HTTP transport (2025-11-25): https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

Last verified: 2026-10-05 against official docs
