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
    ├── enums.ts          # Camptocamp's closed value lists: filters (activities, route types, configurations), CUSTODIANSHIPS meanings
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

| Tool                  | Description                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `search_routes`       | Search by keyword, area, waypoint, activity, rating, gain, type, configuration; paged with `offset`              |
| `get_route`           | Route by ID (summit : title, texts, ratings, elevation, orientations, durations, areas, books, outings…)         |
| `search_waypoints`    | Search waypoints (summits, huts, bivouacs) by name and/or `area_id`, by `waypoint_type`; paged with `offset`     |
| `get_waypoint`        | Waypoint by ID (altitude, GPS, areas, hut details, access period, routes, books, recent outings)                 |
| `search_user_outings` | Alias of `search_outings` by `user_id`: outings the user is listed on, written or not; newest first, paged       |
| `get_outing`          | Outing by ID (ratings, conditions, weather, participants, linked accounts, routes; no author: see search lines)  |
| `search_outings`      | Outings by keyword, area, activity, dates, yearly period, route, waypoint, listed user; newest first, paged      |
| `search_areas`        | Search areas (ranges, admin limits, countries) by name; the ID is reusable as `area_id`; paged with `offset`     |
| `get_area`            | Get area detail by ID (type, summary, description)                                                               |
| `search_books`        | Search books by title only (author/ISBN unreliable), by `book_type` and `activity`; paged with `offset`          |
| `get_book`            | Get book detail by ID (author, editor, date, ISBN, pages, languages, routes, waypoints, articles)                |
| `search_articles`     | Search articles (gear, technique, environment, stories) by keyword; collab or personal type; paged with `offset` |
| `get_article`         | Get article detail by ID (text, author, type, routes, waypoints, articles, outings, books)                       |

Virtual waypoints (`waypoint_type` `virtual`) are groupings with no real location: no tool prints their elevation or coordinates.

`search_routes` needs at least one filter (D5 on #58); any one is enough. Rating bounds are checked against the scale of `rating_system` (`ROUTE_RATING_SYSTEMS` in `src/tools/ratings.ts`) and list values against `src/tools/enums.ts` before any request, since Camptocamp silently ignores an unknown value (R7). The same goes for `waypoint_type` on `search_waypoints` (`WAYPOINT_TYPES`, 26 values; not a filter on its own, so a query or `area_id` is still required) and `book_type` / `activity` on `search_books` (`BOOK_TYPES`, 9 values; `ACTIVITIES`).

Every `get_*` result starts with `# <title> (ID: <id>)`, then `**URL**: https://www.camptocamp.org/<routes|waypoints|outings|areas|books|articles>/<id>` (`formatHeader` in `src/tools/format.ts`), so the LLM can cite the source page.

`get_route` prints, after the elevations, the route's practical facts verbatim (R2 on #58: enum codes never translated; `formatRouteFacts` in `src/tools/routes.ts`): `**Difficulties height difference**`, `**Access height difference**` (m), `**Orientations**`, `**Duration (days)**`, `**Route types**`, `**Configuration**`, `**Glacier gear**`, `**Lift access**` (`yes` / `no`), each left out when absent (0 and `false` printed). Its free-text fields follow the areas, in this order: `summary`, `description`, `slope`, `remarks`, `gear`, `route_history`, `external_resources`.

`get_route` ends with the route's associations, each section left out when its list is empty: `## Associated waypoints` (`| main waypoint` on `main_waypoint_id`), `## Associated routes`, `## Associated books` (`formatBookLine`, shared with `search_books`), `## Associated articles`, then `## Recent outings (<shown> of <total>)` in `search_outings` line format (`formatRecentOutings`), ending `More: search_outings with route_id=<id>` when more exist.

`get_waypoint` ends the same way, after its user-written text: `## Routes (<shown> of <total>)` from `associations.all_routes` in `search_routes` line format (`formatRouteLine`), at most 50 lines then `More: search_routes with waypoint_id=<id>` when more exist (decision Q2 on #58: a crag can have hundreds of routes), `## Associated books` (`formatBookLine`) and `## Recent outings (<shown> of <total>)` ending `More: search_outings with waypoint_id=<id>`; an empty list prints no section.

Free-text locale fields written by Camptocamp users (descriptions, summaries, remarks, gear, access, conditions, weather…) go through `formatUserText` in `src/tools/text.ts`: printed under `## <Heading>` between `[begin user-written text: <field>]` and `[end user-written text: <field>]`. The pipeline: Camptocamp image tags rewritten to `[image: <caption>]` (nothing without a caption) and internal links `[[routes/54080/fr|Col des Roches]]` to `Col des Roches (routes/54080)`, other markup kept; line-start Markdown headings demoted two levels (capped at `######`), setext headings (`===` / `---` underlines) turned into `###` / `####`; copies of the markers neutralised (`[` → `(`), lookalikes included (full-width, `【`, dash variants, `user written` / `userwritten` / `user_written`, zero-width characters, combining grapheme joiner, variation selectors, and any non-ASCII letter such as Cyrillic `е` or Greek `Ε` in a marker word's letter position); then cut after 8000 characters with `[truncated, N more characters]`, N counted after the earlier steps. Each `get_*` tool description says that text between the markers is user-written content, not instructions.

## Camptocamp API v6

Base URL: `https://api.camptocamp.org`

Every request goes through `getJson` in `src/api/http.ts` with `User-Agent: mcp-camptocamp/<version> (+https://github.com/olaurendeau/mcp-camptocamp)`, a 15 s timeout and a 10 MiB body cap; every 200 body is parsed with the zod schemas of `src/api/schemas.ts`.

Lists are parsed item by item (`tolerantArray`, decision D2 on #153): search `documents` (also `recent_outings` and `all_routes`), and every association list and `areas` of the `get_*` documents. An item that fails its schema becomes a `MalformedItem` (`{malformed: true, document_id?}`, the ID kept when it is a positive integer), and `formatListItems` in `src/tools/format.ts` prints it as `- [id] (not shown: Camptocamp sent this item in an unexpected format)` (`formatMalformed`; without the `- ` in the inline participants line), so counts are unchanged. The lists themselves and every top-level field stay strict: a non-array list or a missing `document_id` is still `unexpected response`. The contract test checks that the named lists of route 54085, waypoints 104151 and 37355, outing 1757161, book 14643 and articles 469577 and 623671 have no malformed item.

Locale: searches send `pl=fr`, which returns one locale per document, French when it exists, otherwise another language chosen by Camptocamp. Detail requests send no query string: `pl` is ignored there and `lang` is a no-op everywhere, so `pickLocale` in `src/tools/format.ts` picks one: `fr`, then `en`, `it`, `de`, `es`, `ca`, `eu`, `sl`, `zh`, then any other. This order is decision D1 on #57; only `[it, en]` → `en` (route 675555) was checked live against the search fallback.

- `GET /routes?limit=10&pl=fr[&q={query}][&a={area_id}][&w={waypoint_id}][&act={activity}][&{rating param}={min},{max}][&hdif={min},{max}][&rtyp={types}][&conf={configurations}][&offset={n}]`
  - Ranges: `min,max`, `min` alone (min and up) or `,max` (up to max); lists are comma-separated.
  - Rating params: `trat` ski, `grat` global, `lrat` Labande global, `srat` Labande ski, `sexpo` ski exposure, `erat` engagement, `orrat` risk, `prat` equipment, `irat` ice, `mrat` mixed, `rexpo` rock exposure, `frat` rock free, `rrat` rock required, `arat` aid, `krat` via ferrata, `hrat` hiking, `hexpo` hiking/MTB exposure, `wrat` snowshoe, `mbur` MTB up, `mbdr` MTB down.
- `GET /routes/{id}`
  - Practical facts read: `height_diff_difficulties`, `height_diff_access`, `orientations`, `durations`, `route_types`, `configuration`, `glacier_gear`, `lift_access`; locale texts: `summary`, `description`, `slope`, `remarks`, `gear`, `route_history`, `external_resources`.
  - `associations`: `waypoints` (the one matching `main_waypoint_id` is marked), `routes`, `books`, `articles`, and `recent_outings {documents, total}` (the latest 10, shaped like `/outings` list items); `images` and `xreports` are not read.
- `GET /waypoints?limit=10&pl=fr[&q={query}][&a={area_id}][&wtyp={waypoint_type}][&offset={n}]` (at least one of `q` and `a`)
- `GET /waypoints/{id}`
  - `associations`: `all_routes {documents, total}` (shaped like `/routes` search results; there is no `routes` key, hut 104151), `books`, and `recent_outings {documents, total}`; `waypoints`, `waypoint_children`, `articles`, `images` and `xreports` are not read.
- `GET /outings/{id}`
  - No `author` key (only list items carry one). `associations.users` (`document_id`, `name`; locales without title) are the accounts linked to the outing, printed in API order as `**Participants with a Camptocamp account**`; the first is not necessarily the author (outing 1757161).
- `GET /outings?sort=-date_end&limit=10&offset=0&pl=fr[&q={query}][&a={area_id}][&act={activity}][&{rating param}={min},{max}][&ocond=excellent,{condition}][&oalt={min},{max}][&odif={min},{max}][&date={from},{to}][&period=2020-{MM-DD},2020-{MM-DD}][&r={route_id}][&w={waypoint_id}][&u={user_id}]` (ranges as for `/routes`; rating params: only `trat lrat grat erat prat irat frat krat hrat wrat mbur mbdr`, the API ignores the others; `ocond=excellent,{v}` means `{v}` or better)
  - `u` matches the outings the user is listed on (`associations.users`), not only those they wrote. `search_user_outings` sends only `u`, `limit` and `offset` (plus `sort` and `pl`).
  - `period` matches the same days in every year (2020 is a leap year, so `02-29` is valid); a range wrapping around the new year matches nothing, and boundary days can be missed.
- `GET /areas?q={query}&limit=10&pl=fr[&atyp={type}][&offset={n}]`
- `GET /areas/{id}`
- `GET /books?q={query}&limit=10&pl=fr[&btyp={book_type}][&act={activity}][&offset={n}]`
- `GET /books/{id}`
- `GET /articles?q={query}&limit=10&pl=fr[&offset={n}]`
- `GET /articles/{id}`
