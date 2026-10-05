# Gemini CLI and Gemini Code Assist

Gemini CLI starts this server as a local `stdio` process from its `settings.json`. Gemini Code Assist reads the same kind of `mcpServers` entry: see [Gemini Code Assist](#gemini-code-assist) at the end of this page.

## Before you start

- For the npx variant, install Node.js 22 or later; for the Docker variant, install Docker. See [Prerequisites](../getting-started.md#prerequisites).
- The first start downloads the package or the image: [pre-warm it](../getting-started.md#pre-warm-the-first-start) once.
- Name the server `camptocamp`. Gemini CLI asks for server names without underscores: "Do not use underscores (`_`) in your MCP server names", because its policy rules split tool names on the first underscore after `mcp_`.

## Add the server

Gemini CLI reads `mcpServers` from two `settings.json` files:

- `~/.gemini/settings.json`: your user settings, for every project. Use this one.
- `.gemini/settings.json` in a project: it applies only when you run Gemini CLI from that project, and only if the folder is [trusted](#trust-the-folder).

### Edit settings.json

Add the `camptocamp` entry to the `mcpServers` object of `~/.gemini/settings.json`. If the file has other settings, add `mcpServers` next to them, in the same top-level object.

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

Other keys a server entry accepts include `env`, `cwd`, `timeout` (milliseconds per request, default 600,000), `trust` (see [Stop the confirmation prompts](#stop-the-confirmation-prompts)), `includeTools` and `excludeTools`.

### Or use gemini mcp add

The same entry, written by Gemini CLI:

```sh
gemini mcp add --scope user camptocamp npx -y @olaurendeau/mcp-camptocamp
```

With Docker:

```sh
gemini mcp add --scope user camptocamp docker run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:latest
```

Without `--scope user`, the command writes to the project's `.gemini/settings.json`: `project` is the default scope. Tried with Gemini CLI 0.62.0 on 2026-10-05, both commands wrote exactly the JSON entries shown above to `~/.gemini/settings.json`.

## Trust the folder

Gemini CLI connects to MCP servers only in a trusted folder. In a folder you have not trusted, it runs in a restricted "safe mode": it ignores the project's `.gemini/settings.json`, and "MCP servers do not connect", the ones in your user settings included.

Folder trust is on by default: the configuration reference gives `security.folderTrust.enabled` the default `true`, and with Gemini CLI 0.62.0 a new folder was untrusted (the Trusted Folders page still says the feature is disabled by default). To trust a folder:

- The first time you run Gemini CLI from a folder, it asks whether to trust it: choose **Trust folder**, or **Trust parent folder** to trust every folder under the parent. Gemini CLI remembers the answer in `~/.gemini/trustedFolders.json`.
- To change the answer later, run `/permissions` inside Gemini CLI.
- To trust the folder for one session only, start Gemini CLI with `--skip-trust`, or set `GEMINI_CLI_TRUST_WORKSPACE=true`.

In an untrusted folder, `gemini mcp list` doesn't start the server. Tried with Gemini CLI 0.62.0 on 2026-10-05, it printed "MCP servers are configured but disabled because this folder is untrusted" and showed `camptocamp` as `Disabled`; the MCP documentation says "Disconnected".

About `gemini trust`: the MCP documentation says "Use `gemini trust` to trust the current folder." Gemini CLI 0.62.0 has no such command: `gemini --help` lists none, and `gemini trust` sends "trust" as the first prompt of a new session. Use the trust dialog, `/permissions` or `--skip-trust` instead.

## Stop the confirmation prompts

By default, Gemini CLI asks before each call to an MCP tool. Besides **Proceed once**, the prompt offers **Always allow this tool** and **Always allow this server**. To set it up once, before the first call, use a policy rule or `trust`.

### A policy rule (recommended)

Create a policy file in the user policy folder, for example `~/.gemini/policies/camptocamp.toml` (on Windows, `%USERPROFILE%\.gemini\policies\camptocamp.toml`). Gemini CLI loads every `.toml` file of that folder.

```toml
[[rule]]
mcpName = "camptocamp"
toolAnnotations = { readOnlyHint = true }
decision = "allow"
priority = 200
```

- `mcpName = "camptocamp"` matches the tools of this server only.
- `toolAnnotations` makes the rule match only the tools whose annotations contain `readOnlyHint = true`. All 13 tools (15 from the release after v1.3.0) of this server declare it, so the rule allows them all; a future tool that is not read-only would still ask. Remove that line to allow every tool of the server.
- `priority` orders the rules of a tier, from 0 to 999; user policies take precedence over Gemini CLI's built-in ones.
- Put the file in `~/.gemini/policies/`: policies in a project's `.gemini/policies/` currently have no effect.

### trust

`"trust": true` in the server entry, or `--trust` on `gemini mcp add`, "bypasses all tool call confirmations for this server":

```json
{
  "mcpServers": {
    "camptocamp": {
      "command": "npx",
      "args": ["-y", "@olaurendeau/mcp-camptocamp"],
      "trust": true
    }
  }
}
```

Google advises using `trust` "only for servers you completely control". The policy rule above is narrower: it allows only the read-only tools of this server.

## Check that it works

- Inside Gemini CLI, `/mcp` shows each server's status (`CONNECTED`, `CONNECTING` or `DISCONNECTED`) and its tools. Gemini CLI names them `mcp_camptocamp_search_routes`, `mcp_camptocamp_get_route`, and so on.
- From a terminal, `gemini mcp list` shows `camptocamp` with `Connected` once the server answered.

Gemini CLI appends the server's instructions, which explain how to chain the tools, to its system instructions. Then ask, for example: "What is the altitude of the Grande Casse? Use the Camptocamp tools."

If the server is missing, see [Troubleshooting](../troubleshooting.md), starting with [The server times out on its first start](../troubleshooting.md#the-server-times-out-on-its-first-start).

## Gemini Code Assist

Gemini Code Assist runs MCP servers in agent mode, in VS Code and in IntelliJ (and other JetBrains IDEs). Google's documentation describes the setup below; it doesn't say whether the Gemini CLI `trust` key or policy files apply to Code Assist, so this section doesn't use them.

### VS Code

1. Add the `camptocamp` entry to the `mcpServers` object of `~/.gemini/settings.json`, as in [Edit settings.json](#edit-settingsjson) (npx or Docker). The command palette can't install MCP servers for agent mode.
2. In the command palette, run **Developer: Reload Window**.
3. In agent mode, `/mcp` lists the configured servers, their status and their tools.

The only way Google documents to stop the prompts is yolo mode, which allows **every** agent action, file edits and terminal commands included, and works only in a trusted workspace. In the command palette, run **Preferences: Open User Settings (JSON)**, add this setting next to the others, then reload the window:

```json
{
  "geminicodeassist.agentYoloMode": true
}
```

Google warns: "Be extremely careful where and when you automatically allow agent actions."

### IntelliJ and other JetBrains IDEs

1. Create a file named `mcp.json` in your IDE's configuration directory, with the same `mcpServers` object:

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

   For Docker, use `"command": "docker"` and `"args": ["run", "--rm", "-i", "ghcr.io/olaurendeau/mcp-camptocamp:latest"]`.

2. To stop the prompts, open the agent tab's **Agent options** and check **Auto-approve changes**. Like yolo mode, it approves every request of the agent, not only this server's tools.

## Sources

- Gemini CLI, MCP servers (configuration, `gemini mcp add`, `gemini mcp list`, trust, confirmations, tool names, instructions): https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md (also at https://geminicli.com/docs/tools/mcp-server/)
- Gemini CLI, policy engine (`mcpName`, `toolAnnotations`, policy folders): https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md
- Gemini CLI, trusted folders: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md
- Gemini CLI, CLI reference (`gemini mcp add` examples, `--skip-trust`): https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md
- Gemini CLI, configuration (settings files, `security.folderTrust.enabled`): https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- Gemini Code Assist, agent mode: https://docs.cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer

Last verified: 2026-10-05 against official docs
