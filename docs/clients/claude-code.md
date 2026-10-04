# Claude Code

Claude Code starts this server on your machine as a local stdio server. One command adds it, and one permission rule lets Claude call its 13 tools without asking each time.

## Prerequisites

- [Claude Code](https://code.claude.com/docs/en/overview).
- One way to run the server:
  - npx: [Node.js](https://nodejs.org/en/download) 22 or later. Check with `node --version`.
  - Docker: [Docker](https://docs.docker.com/get-started/get-docker/).

The first start downloads the npm package or the Docker image. Download it once beforehand, as shown in [Pre-warm the first start](../getting-started.md#pre-warm-the-first-start), or raise the [startup timeout](#startup-timeout).

## Add the server

Add it for your user, in every project:

```sh
claude mcp add --transport stdio --scope user camptocamp -- npx -y @olaurendeau/mcp-camptocamp
```

With Docker:

```sh
claude mcp add --transport stdio --scope user camptocamp -- docker run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:latest
```

The `--` is required. It separates Claude Code's own options (`--transport`, `--scope`) from the command that starts the server, and everything after it is passed to that command untouched. Without it, Claude Code would read `-y` or `--rm` as its own options.

The command prints an `Added ...` line.

### Choose a scope

`--scope` decides where Claude Code stores the server and in which projects it loads:

| Scope             | Loads in             | Shared with your team    | Stored in                   |
| ----------------- | -------------------- | ------------------------ | --------------------------- |
| `local` (default) | Current project only | No                       | `~/.claude.json`            |
| `project`         | Current project only | Yes, via version control | `.mcp.json` in project root |
| `user`            | All your projects    | No                       | `~/.claude.json`            |

Without `--scope`, the server is added for the current project only. To share it with everyone who works on a repository, add it with `--scope project` and commit `.mcp.json`:

```sh
claude mcp add --transport stdio --scope project camptocamp -- npx -y @olaurendeau/mcp-camptocamp
```

Or add the entry by hand under `mcpServers` in `.mcp.json` at the project root:

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

For security, Claude Code asks each person to approve a project-scoped server from `.mcp.json` in an interactive session before it uses it. `claude mcp reset-project-choices` resets those choices.

If `camptocamp` is defined in more than one scope, Claude Code uses the whole entry from the local scope first, then the project scope, then the user scope.

## Check the connection

From a terminal:

```sh
claude mcp list
claude mcp get camptocamp
```

`claude mcp list` shows `✔ Connected` next to `camptocamp` when Claude Code could start it, and `✘ Failed to connect` with the failure detail otherwise. Inside Claude Code, `/mcp` shows the server's status and its tool count, 13.

## Allow the tools without prompts

Add an allow rule for the server. Allow rules "let Claude Code use the specified tool without manual approval". For this server, either form works:

- `mcp__camptocamp` matches every tool of the `camptocamp` server.
- `mcp__camptocamp__*` matches every tool of the server too.

To allow a single tool, name it: `mcp__camptocamp__search_routes`.

For all your projects, put the rule in your user settings, `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["mcp__camptocamp"]
  }
}
```

If the file already has a `permissions.allow` list, add `"mcp__camptocamp"` to it. To share the rule with a team, put it in the project's `.claude/settings.json` instead: Claude Code applies allow rules from that file only after you accept the workspace trust dialog for the folder.

You can also add the rule from inside Claude Code with `/permissions`, which lists every rule and the settings file it comes from.

The 13 tools only read public Camptocamp data: allowing the server lets Claude search and read Camptocamp without asking, not change anything. Some rules to keep in mind:

- The rule uses the server name you gave in `claude mcp add`. If you named the server something other than `camptocamp`, change the rule to match.
- Claude Code skips an allow rule that is a bare glob, such as `mcp__*`, and an `mcp__` rule with parentheses. Use one of the forms above.
- Deny and ask rules win over allow rules: a matching `ask` rule still prompts.

## Limits

### Tool descriptions cut at 2,048 characters

Claude Code cuts each tool description and each server's instructions at 2,048 characters by default.

Measured on v1.3.0 on 2026-10-05, the server's instructions are 569 characters and 12 of the 13 tool descriptions are shorter than 2,048 characters. The `search_outings` description is 2,241 characters: Claude Code drops its last two sentences, which explain the `lang` input. The description of the `lang` input itself still says the default is `fr`. The [smoke test](../getting-started.md#smoke-test) prints the version you run.

From Claude Code v2.1.280, the `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` environment variable changes this limit, in characters, for every MCP server of the session. To keep the whole `search_outings` description:

```sh
CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH=4096 claude
```

### Tool output: warning at 10,000 tokens, cap at 25,000

Claude Code shows a warning when an MCP tool's output exceeds 10,000 tokens, and limits output to 25,000 tokens by default. When a text result exceeds the limit, Claude Code saves it to a file and replaces it in the conversation with a message that names the file, which Claude reads when it needs the content.

To keep results small, ask for fewer results per call: the search tools take a `limit`. Or raise the cap with the `MAX_MCP_OUTPUT_TOKENS` environment variable:

```sh
MAX_MCP_OUTPUT_TOKENS=50000 claude
```

The 10,000-token warning threshold is fixed.

### Startup timeout

The `MCP_TIMEOUT` environment variable sets how long Claude Code waits for an MCP server to start, in milliseconds. To give the first `npx` or `docker` start 30 seconds:

```sh
MCP_TIMEOUT=30000 claude
```

## Remove the server

```sh
claude mcp remove camptocamp --scope user
```

Use the scope you added it with. The Claude Code docs give this form, `claude mcp remove <name> --scope <scope>`, in [Configuration warnings](https://code.claude.com/docs/en/mcp#configuration-warnings), to remove a server from one scope when it is defined in several. Remove the allow rule from your settings file as well.

## Troubleshooting

- The server shows `✘ Failed to connect`: run the [smoke test](../getting-started.md#smoke-test) with the same command to see its errors.
- It fails on its first start only: [pre-warm it](../getting-started.md#pre-warm-the-first-start) or raise [`MCP_TIMEOUT`](#startup-timeout).
- With Docker, it stops at once: check that `-i` is in the command ([Troubleshooting](../troubleshooting.md#docker-the-server-stops-right-after-it-starts)).
- The tools have no `lang` input: the server is older than v1.3.0 ([Troubleshooting](../troubleshooting.md#the-server-is-older-than-expected-or-lang-is-ignored)).

## Sources

- Connect Claude Code to tools via MCP: https://code.claude.com/docs/en/mcp
- Configure permissions: https://code.claude.com/docs/en/permissions
- Claude Code settings: https://code.claude.com/docs/en/settings

Last verified: 2026-10-05 against official docs
