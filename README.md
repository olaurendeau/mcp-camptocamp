# mcp-camptocamp

An MCP server that lets an LLM look up mountain routes, summits, huts and trip reports on [Camptocamp.org](https://www.camptocamp.org) instead of guessing them.

<!-- mcp-name: io.github.olaurendeau/mcp-camptocamp -->

[![CI](https://github.com/olaurendeau/mcp-camptocamp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/olaurendeau/mcp-camptocamp/actions/workflows/ci.yml)
[![Contract](https://github.com/olaurendeau/mcp-camptocamp/actions/workflows/contract.yml/badge.svg)](https://github.com/olaurendeau/mcp-camptocamp/actions/workflows/contract.yml)
[![npm version](https://img.shields.io/npm/v/@olaurendeau/mcp-camptocamp)](https://www.npmjs.com/package/@olaurendeau/mcp-camptocamp)
[![npm downloads](https://img.shields.io/npm/dm/@olaurendeau/mcp-camptocamp)](https://www.npmjs.com/package/@olaurendeau/mcp-camptocamp)
[![MCP registry](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.modelcontextprotocol.io%2Fv0%2Fservers%2Fio.github.olaurendeau%252Fmcp-camptocamp%2Fversions%2Flatest&query=%24.server.version&label=MCP%20registry)](https://registry.modelcontextprotocol.io/v0/servers/io.github.olaurendeau%2Fmcp-camptocamp/versions/latest)
[![Node](https://img.shields.io/node/v/@olaurendeau/mcp-camptocamp)](https://www.npmjs.com/package/@olaurendeau/mcp-camptocamp)
[![License](https://img.shields.io/github/license/olaurendeau/mcp-camptocamp)](LICENSE)
[![GHCR](https://img.shields.io/badge/ghcr.io-amd64%20%7C%20arm64-2496ED?logo=docker&logoColor=white)](https://github.com/olaurendeau/mcp-camptocamp/pkgs/container/mcp-camptocamp)

## What it does

Ask an LLM for the altitude of a summit or the rating of a ski tour and it may answer from memory, and get it wrong. This server gives it read-only access to Camptocamp.org, the collaborative mountaineering site: routes with their ratings and descriptions, summits and huts with their altitudes, trip reports with the conditions people found, areas, guidebooks and articles. Every tool output comes from the public Camptocamp API, with the camptocamp.org link to cite, and a value Camptocamp does not have is left out, never guessed. It needs no account and no API key.

An example conversation from October 2026, run against the published server (v1.3.0); the answer's table is cut to its first 5 rows:

> **Prompt:** Give me the top 10 of most climbed routes on l'aiguille verte. With a very concise response
>
> _Called camptocamp 20 times_
>
> Top 10 routes on the Aiguille Verte, ranked by the number of camptocamp outings logged since the site began:
>
> | #   | Route                    | Grade | Outings |
> | --- | ------------------------ | ----- | ------- |
> | 1   | Couloir Whymper          | AD+   | 241     |
> | 2   | Couloir Couturier        | D     | 92      |
> | 3   | Arête du Jardin          | D-    | 33*     |
> | 4   | Arête des Grands Montets | D     | 24      |
> | 5   | Arête du Moine           | AD+   | 22*     |
> | …   | _5 more rows_            |       |         |
>
> \* Two counts are inflated. The Arête du Jardin figure includes traverses that stop at the Aiguille du Jardin without reaching the Verte. The Arête du Moine figure includes outings where it was only the descent route.
>
> These are camptocamp reports, not actual ascents.

## Quick start

The server runs on your machine, started by your MCP client over stdio. Run it with npx, which needs [Node.js](https://nodejs.org/en/download) 22 or later, or with [Docker](https://docs.docker.com/get-started/get-docker/).

**npx.** Clients configured with an `mcpServers` JSON object, such as Claude Desktop (`claude_desktop_config.json`), Gemini CLI (`settings.json`) or Cursor (`.cursor/mcp.json`), take this entry:

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

In Claude Code, one command adds it for every project:

```sh
claude mcp add --transport stdio --scope user camptocamp -- npx -y @olaurendeau/mcp-camptocamp
```

**Docker.** Use this entry instead; the image runs on amd64 and arm64:

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

The first start downloads the package or the image, which can outlast a client's startup timeout. [Getting started](docs/getting-started.md) shows how to download it beforehand, a smoke test, and the Docker command for Claude Code; [Troubleshooting](docs/troubleshooting.md) helps when the server does not show up.

The server is listed in the [official MCP registry](https://registry.modelcontextprotocol.io/v0/servers/io.github.olaurendeau%2Fmcp-camptocamp/versions/latest) as `io.github.olaurendeau/mcp-camptocamp`.

## Supported clients

| Client                                                              | Works?                                                  | Setup                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| Claude Desktop                                                      | Yes                                                     | [Claude Desktop](docs/clients/claude-desktop.md)                           |
| Claude Code                                                         | Yes                                                     | [Claude Code](docs/clients/claude-code.md)                                 |
| ChatGPT desktop app, Codex CLI and Codex IDE extension              | Yes                                                     | [ChatGPT desktop app and Codex](docs/clients/chatgpt-desktop-and-codex.md) |
| Mistral Vibe Code CLI and VS Code extension                         | Yes                                                     | [Mistral Vibe Code](docs/clients/mistral-vibe-code.md)                     |
| Gemini CLI, Gemini Code Assist                                      | Yes: CLI in a trusted folder, Code Assist in agent mode | [Gemini CLI and Gemini Code Assist](docs/clients/gemini-cli.md)            |
| Your own agent: OpenAI Agents SDK, Mistral Python SDK, google-genai | Yes                                                     | [Agent SDKs](docs/agent-sdks.md)                                           |
| Cursor and other clients that start a local command                 | Yes                                                     | [Getting started](docs/getting-started.md#other-mcp-clients)               |
| Claude.ai custom connectors, Vibe Work                              | With an instance you host over HTTP (v1.4.0 or later)   | [Self-hosting over HTTP](docs/self-hosting.md)                             |
| ChatGPT on the web, Gemini API                                      | No: remote servers only                                 | [Remote-only clients](docs/clients/remote-only.md)                         |

The [support matrix](docs/README.md#support-matrix) lists the clients covered by the client pages and the agent SDK guide, with the date each page was last checked against the vendor's docs.

## Tools

13 read-only tools in v1.3.0: one search and one detail tool per kind of Camptocamp document, plus a shortcut for a user's outings. The release after v1.3.0 adds two: `get_outings`, to read several outings in one call, and `outing_stats`, to count outings by month, year or condition. Search results give IDs; the `get_*` tools take an ID. Every tool takes `lang`, the language of titles and texts (`fr` by default; v1.3.0 or later).

| Tool                                                       | What it does                                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`search_routes`](docs/tools/search_routes.md)             | Search routes by keyword, area, waypoint, activity, rating, elevation gain, route type or configuration; paged.  |
| [`get_route`](docs/tools/get_route.md)                     | One route by ID: ratings, elevation, practical facts, description, areas, books, waypoints and recent outings.   |
| [`search_waypoints`](docs/tools/search_waypoints.md)       | Search summits, huts, passes, crags and other waypoints by name and/or area, optionally by type; paged.          |
| [`get_waypoint`](docs/tools/get_waypoint.md)               | One waypoint by ID: altitude, GPS coordinates, hut details, access, areas, routes, books and outings.            |
| [`search_outings`](docs/tools/search_outings.md)           | Search trip reports by keyword, area, activity, ratings, conditions, elevation, dates, routes, waypoint or user. |
| [`search_user_outings`](docs/tools/search_user_outings.md) | The outings a Camptocamp user is listed on, by user ID; an alias of `search_outings`.                            |
| [`get_outing`](docs/tools/get_outing.md)                   | One outing by ID: reported ratings and conditions, weather, report text, participants and routes.                |
| [`get_outings`](docs/tools/get_outings.md)                 | Up to 10 outings by ID in one call, in `get_outing` format, each section cut at 2,000 characters; not in v1.3.0. |
| [`outing_stats`](docs/tools/outing_stats.md)               | Count the outings matching `search_outings` filters by start month, start year or condition; not in v1.3.0.      |
| [`search_areas`](docs/tools/search_areas.md)               | Search ranges, administrative subdivisions and countries by name; the ID is reusable as `area_id`.               |
| [`get_area`](docs/tools/get_area.md)                       | One area by ID: type, summary and description.                                                                   |
| [`search_books`](docs/tools/search_books.md)               | Search guidebooks and other books by title, book type and activity; author and ISBN searches are unreliable.     |
| [`get_book`](docs/tools/get_book.md)                       | One book by ID: author, editor, date, ISBN, languages, and the routes, waypoints and articles it covers.         |
| [`search_articles`](docs/tools/search_articles.md)         | Search articles (gear, technique, environment, stories) by keyword; by category, type and activity after v1.3.0. |
| [`get_article`](docs/tools/get_article.md)                 | One article by ID: text, author, type, and the routes, waypoints, articles, outings and books linked to it.      |

Each tool page gives its inputs, generated from the registered schema, its output format, a real example and its limits: see the [tool reference](docs/tools/README.md).

## Guides

- [Using the tools with an LLM](docs/using-with-llms.md): which tools to chain for a region, a summit altitude, a hut, recent conditions or guidebooks; what each output line means; and a real June ski-tour example.
- [System prompt](docs/system-prompt.md): a prompt to paste into your agent, so the model quotes Camptocamp, cites it and says when a value is missing.
- [Self-hosting over HTTP](docs/self-hosting.md): host an instance behind a secret token for clients that only take a URL, such as Claude.ai and Vibe Work (v1.4.0 or later).
- [Documentation index](docs/README.md): every page, by topic.

## Development

Everything runs in Docker, through the `Makefile`: no local Node.js is needed. `make check` runs the same steps as the CI `checks` job: format, lint, type check, tests with enforced coverage thresholds (95 % of lines, functions and statements, 90 % of branches), build and hook tests.
Every change lands through a reviewed pull request: see [CONTRIBUTING.md](CONTRIBUTING.md) (in French), and [Development](docs/development.md) for the make targets, the live API contract tests, releases and the stack.

## License

[MIT](LICENSE)
