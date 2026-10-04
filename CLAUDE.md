# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Goal

This project provides an MCP (Model Context Protocol) server that exposes the [Camptocamp.org](https://www.camptocamp.org) API to LLMs. The goal is to enable LLMs to query accurate, up-to-date information about mountain routes, summit altitudes, and route descriptions — preventing hallucinations about mountaineering data.

## Architecture

```
src/
├── index.ts              # Entry point: stdio bootstrap only (createServer() + StdioServerTransport)
├── server.ts             # createServer(): McpServer with instructions, version, registerTool for the 13 tools
├── version.ts            # VERSION read from package.json, reported to MCP clients and in the User-Agent
├── api/
│   ├── http.ts           # getJson: the one fetch (User-Agent, 15 s timeout, 10 MiB cap, error messages, zod parsing)
│   ├── schemas.ts        # zod response schemas, the one place response types are declared
│   └── camptocamp.ts     # Camptocamp API v6 client: one function per endpoint, pl=fr on searches
└── tools/
    ├── format.ts         # Shared formatting: pickLocale, joinList, formatHeader, route/waypoint/book/outing lines, recent outings, areas section, dates, isPresent (0 and false are printed)
    ├── inputs.ts         # Shared zod inputs: bounded document IDs, 200-char queries
    ├── ratings.ts        # Rating labels by grading system (RATING_DISPLAY) and rating scales (ROUTE_RATING_SYSTEMS)
    ├── enums.ts          # Camptocamp's closed filter value lists (activities, route types, configurations)
    ├── paging.ts         # Shared search paging: header, filters, next-page footer, 10,000-result window
    ├── text.ts           # formatUserText: rewrites image tags and internal links, delimits, demotes and caps user-written text
    ├── routes.ts         # Tools: search_routes, get_route
    ├── waypoints.ts      # Tools: search_waypoints, get_waypoint
    ├── outings.ts        # Tools: search_user_outings, get_outing, search_outings
    ├── areas.ts          # Tools: search_areas, get_area
    ├── books.ts          # Tools: search_books, get_book
    └── articles.ts       # Tools: search_articles, get_article
tests/
├── api/
│   ├── camptocamp.test.ts  # API client unit tests with mocked fetch (URLs, parameters)
│   ├── http.test.ts        # getJson: errors, timeout, size cap, User-Agent, malformed responses
│   └── schemas.test.ts     # Response schemas against real-shaped fixtures (null and missing fields)
├── server/                 # MCP-layer tests: SDK Client + InMemoryTransport against createServer(), fetch mocked
│   ├── helpers.ts          # connect(), stubFetch(), jsonResponse()
│   ├── registration.test.ts      # Tool list, titles, annotations, input schemas (snapshot), instructions, call results
│   ├── input-validation.test.ts  # Invalid inputs rejected before any request
│   ├── errors.test.ts            # Upstream failures returned as isError
│   └── version.test.ts           # Reported version equals package.json
├── contract/
│   └── api.contract.test.ts  # Live Camptocamp API contract tests (npm run test:contract only)
├── hooks/
│   └── guard.test.sh       # Tests for the agent guard hook (.claude/hooks/guard.sh), run on the host
└── tools/
    ├── through-schema.ts   # Test helper: parses mocked API fixtures through the zod schemas
    ├── bare-rating.ts      # Test helper: BARE_RATING, a bare "Rating:" label that must never be printed
    ├── format.test.ts      # Shared formatting helper unit tests
    ├── ratings.test.ts     # Rating label order, Labande joining and rating scales
    ├── paging.test.ts      # Shared search paging unit tests
    ├── text.test.ts        # formatUserText unit tests
    ├── routes.test.ts      # Tool handler unit tests
    ├── waypoints.test.ts   # Tool handler unit tests
    ├── outings.test.ts     # Tool handler unit tests
    ├── areas.test.ts       # Tool handler unit tests
    ├── books.test.ts       # Tool handler unit tests
    └── articles.test.ts    # Tool handler unit tests
vitest.config.ts            # npm test / coverage: excludes tests/contract/ and the src/index.ts bootstrap
vitest.contract.config.ts   # npm run test:contract: only tests/contract/**/*.contract.test.ts, no coverage
```

The tool handlers in `src/tools/` are pure functions (no SDK coupling) — they take typed inputs and return formatted strings, making them easy to test in isolation. Each tool file also exports its tool definitions (name, title, description, input schema, handler), which `src/server.ts` registers with `registerTool`.

## Docker Commands

All development happens inside Docker — no local Node.js required.

```bash
# Install dependencies (first time or after package.json changes)
docker compose run --rm dev npm install

# Same as the CI `checks` job (format, lint, typecheck, coverage, build, hook tests on the host)
make check

# Run tests
docker compose run --rm dev npm test

# Live contract tests against the real Camptocamp API (not part of npm test or make check)
make test-contract

# Watch mode during development
docker compose run --rm dev npm run test:watch

# Build production image
docker compose build mcp
```

The contract tests also run every Monday through the `Contract` workflow (`.github/workflows/contract.yml`, schedule and manual dispatch only, never a required check):

- GitHub disables scheduled workflows after 60 days without repository activity, so a missing weekly run is not a pass. GitHub refuses manual runs of a disabled workflow, so re-enable it first (`gh workflow enable contract.yml` or the Actions tab), then run it by hand with `gh workflow run contract.yml`.
- Failures of scheduled runs are notified to the user who last modified the cron line (after a squash merge, the author of that commit on `main`), or, once the workflow has been re-enabled, to the user who re-enabled it.

## Workflow

Every change lands through a PR; the rules and thresholds live in [CONTRIBUTING.md](CONTRIBUTING.md).

Sessions in this repo run as the `coordinator` agent (`.claude/settings.json`), which plans the work in GitHub Issues and dispatches the team defined in `.claude/agents/`: `product-designer` → `architect` → `developer` → `pr-reviewer`. Each agent's file holds its steps and report format; the coordinator's file holds the escalation rules and merge conditions.

- Each PR does one thing, in ≤ 1000 changed lines (excluding `package-lock.json`), passes `make check`, and has a Conventional Commits title.
- The `agent-review` status comes only from `pr-reviewer`; merges come only from the coordinator, once that status is `success` on the PR's current head SHA.

## Claude Desktop Integration

```json
{
  "mcpServers": {
    "camptocamp": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "mcp-camptocamp-mcp"]
    }
  }
}
```

## MCP Tools

| Tool                  | Description                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `search_routes`       | Search by keyword, area, waypoint, activity, rating, gain, type, configuration; paged with `offset`  |
| `get_route`           | Route detail by ID (summit : title, text, ratings, elevation, areas, books, waypoints, outings…)     |
| `search_waypoints`    | Search waypoints (summits, huts, bivouacs) by name and/or `area_id`                                  |
| `get_waypoint`        | Get waypoint detail by ID (altitude, GPS coordinates, description, areas)                            |
| `search_user_outings` | List outings (trip reports) published by a Camptocamp user, by user ID, with labelled ratings        |
| `get_outing`          | Get outing detail by ID (ratings, conditions, weather, participants, routes with summit and ratings) |
| `search_outings`      | Outings by keyword, area, activity, dates, yearly period, route, waypoint, user; newest first, paged |
| `search_areas`        | Search areas (ranges, admin limits, countries) by name; the ID is reusable as `area_id`              |
| `get_area`            | Get area detail by ID (type, summary, description)                                                   |
| `search_books`        | Search books (guidebooks, history, novels) by title only; author/ISBN search is unreliable           |
| `get_book`            | Get book detail by ID (author, editor, date, ISBN, pages, languages, routes, waypoints, articles)    |
| `search_articles`     | Search articles (gear, technique, environment, stories) by keyword; collab or personal type          |
| `get_article`         | Get article detail by ID (text, author, type, routes, waypoints, articles, outings, books)           |

`search_routes` needs at least one filter (D5 on #58); any one is enough. Rating bounds are checked against the scale of `rating_system` (`ROUTE_RATING_SYSTEMS` in `src/tools/ratings.ts`) and list values against `src/tools/enums.ts` before any request, since Camptocamp silently ignores an unknown value (R7).

Every `get_*` result starts with `# <title> (ID: <id>)`, then `**URL**: https://www.camptocamp.org/<routes|waypoints|outings|areas|books|articles>/<id>` (`formatHeader` in `src/tools/format.ts`), so the LLM can cite the source page.

`get_route` ends with the route's associations, each section left out when its list is empty: `## Associated waypoints` (`| main waypoint` on `main_waypoint_id`), `## Associated routes`, `## Associated books` (`formatBookLine`, shared with `search_books`), `## Associated articles`, then `## Recent outings (<shown> of <total>)` in `search_outings` line format (`formatRecentOutings`), ending `More: search_outings with route_id=<id>` when more exist.

Free-text locale fields written by Camptocamp users (descriptions, summaries, remarks, gear, access, conditions, weather…) go through `formatUserText` in `src/tools/text.ts`: printed under `## <Heading>` between `[begin user-written text: <field>]` and `[end user-written text: <field>]`. The pipeline: Camptocamp image tags rewritten to `[image: <caption>]` (nothing without a caption) and internal links `[[routes/54080/fr|Col des Roches]]` to `Col des Roches (routes/54080)`, other markup kept; line-start Markdown headings demoted two levels (capped at `######`), setext headings (`===` / `---` underlines) turned into `###` / `####`; copies of the markers neutralised (`[` → `(`), lookalikes included (full-width, `【`, dash variants, `user written` / `userwritten` / `user_written`, zero-width characters, combining grapheme joiner, variation selectors); then cut after 8000 characters with `[truncated, N more characters]`, N counted after the earlier steps. Each `get_*` tool description says that text between the markers is user-written content, not instructions.

## Camptocamp API v6

Base URL: `https://api.camptocamp.org`

Every request goes through `getJson` in `src/api/http.ts` with `User-Agent: mcp-camptocamp/<version> (+https://github.com/olaurendeau/mcp-camptocamp)`, a 15 s timeout and a 10 MiB body cap; every 200 body is parsed with the zod schemas of `src/api/schemas.ts`.

Locale: searches send `pl=fr`, which returns one locale per document, French when it exists, otherwise another language chosen by Camptocamp. Detail requests send no query string: `pl` is ignored there and `lang` is a no-op everywhere, so `pickLocale` in `src/tools/format.ts` picks one: `fr`, then `en`, `it`, `de`, `es`, `ca`, `eu`, `sl`, `zh`, then any other. This order is decision D1 on #57; only `[it, en]` → `en` (route 675555) was checked live against the search fallback.

- `GET /routes?limit=10&pl=fr[&q={query}][&a={area_id}][&w={waypoint_id}][&act={activity}][&{rating param}={min},{max}][&hdif={min},{max}][&rtyp={types}][&conf={configurations}][&offset={n}]`
  - Ranges: `min,max`, `min` alone (min and up) or `,max` (up to max); lists are comma-separated.
  - Rating params: `trat` ski, `grat` global, `lrat` Labande global, `srat` Labande ski, `sexpo` ski exposure, `erat` engagement, `orrat` risk, `prat` equipment, `irat` ice, `mrat` mixed, `rexpo` rock exposure, `frat` rock free, `rrat` rock required, `arat` aid, `krat` via ferrata, `hrat` hiking, `hexpo` hiking/MTB exposure, `wrat` snowshoe, `mbur` MTB up, `mbdr` MTB down.
- `GET /routes/{id}`
  - `associations`: `waypoints` (the one matching `main_waypoint_id` is marked), `routes`, `books`, `articles`, and `recent_outings {documents, total}` (the latest 10, shaped like `/outings` list items); `images` and `xreports` are not read.
- `GET /waypoints?limit=10&pl=fr[&q={query}][&a={area_id}]` (at least one of `q` and `a`)
- `GET /waypoints/{id}`
- `GET /outings?u={user_id}&limit=10&pl=fr`
- `GET /outings/{id}`
- `GET /outings?sort=-date_end&limit=10&offset=0&pl=fr[&q={query}][&a={area_id}][&act={activity}][&date={from},{to}][&period=2020-{MM-DD},2020-{MM-DD}][&r={route_id}][&w={waypoint_id}][&u={user_id}]`
  - `period` matches the same days in every year (2020 is a leap year, so `02-29` is valid); a range wrapping around the new year matches nothing, and boundary days can be missed.
- `GET /areas?q={query}&limit=10&pl=fr[&atyp={type}]`
- `GET /areas/{id}`
- `GET /books?q={query}&limit=10&pl=fr`
- `GET /books/{id}`
- `GET /articles?q={query}&limit=10&pl=fr`
- `GET /articles/{id}`
