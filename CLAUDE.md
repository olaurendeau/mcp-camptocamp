# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Goal

This project provides an MCP (Model Context Protocol) server that exposes the [Camptocamp.org](https://www.camptocamp.org) API to LLMs. The goal is to enable LLMs to query accurate, up-to-date information about mountain routes, summit altitudes, and route descriptions — preventing hallucinations about mountaineering data.

## Architecture

```
src/
├── index.ts              # MCP server entry point, tool registration, stdio transport
├── api/
│   └── camptocamp.ts     # Camptocamp API v6 client (fetch wrapper, typed responses)
└── tools/
    ├── routes.ts         # Tools: search_routes, get_route
    ├── waypoints.ts      # Tools: search_waypoints, get_waypoint
    ├── outings.ts        # Tools: search_user_outings, get_outing, search_outings
    ├── areas.ts          # Tools: search_areas, get_area
    └── books.ts          # Tools: search_books, get_book
tests/
├── api/
│   └── camptocamp.test.ts  # Unit tests with mocked fetch
└── tools/
    ├── routes.test.ts      # Tool handler unit tests
    ├── waypoints.test.ts   # Tool handler unit tests
    ├── outings.test.ts     # Tool handler unit tests
    ├── areas.test.ts       # Tool handler unit tests
    └── books.test.ts       # Tool handler unit tests
```

The tool handlers in `src/tools/` are pure functions (no SDK coupling) — they take typed inputs and return formatted strings, making them easy to test in isolation.

## Docker Commands

All development happens inside Docker — no local Node.js required.

```bash
# Install dependencies (first time or after package.json changes)
docker compose run --rm dev npm install

# Same as the CI `checks` job (format, lint, typecheck, coverage, build, hook tests on the host)
make check

# Run tests
docker compose run --rm dev npm test

# Watch mode during development
docker compose run --rm dev npm run test:watch

# Build production image
docker compose build mcp
```

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

| Tool                  | Description                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `search_routes`       | Search routes by keyword and/or `area_id`; returns ID, title, activities, elevation, rating |
| `get_route`           | Get full route detail by ID (description, ratings, elevation data, gear, areas)             |
| `search_waypoints`    | Search waypoints (summits, huts, bivouacs) by name and/or `area_id`                         |
| `get_waypoint`        | Get waypoint detail by ID (altitude, GPS coordinates, description, areas)                   |
| `search_user_outings` | List outings (trip reports) published by a Camptocamp user, by user ID                      |
| `get_outing`          | Get outing detail by ID (conditions, weather, participants, associated routes)              |
| `search_outings`      | Search outings by keyword, area, activity, date range, route or waypoint, most recent first |
| `search_areas`        | Search areas (ranges, admin limits, countries) by name; the ID is reusable as `area_id`     |
| `get_area`            | Get area detail by ID (type, summary, description)                                          |
| `search_books`        | Search books (guidebooks, history, novels) by title only; author/ISBN search is unreliable  |
| `get_book`            | Get book detail by ID (author, editor, date, ISBN, pages, languages, routes and waypoints)  |

## Camptocamp API v6

Base URL: `https://api.camptocamp.org`

- `GET /routes?q={query}&limit=10&lang=fr`
- `GET /routes?a={area_id}&limit=10&lang=fr` (combinable with `q`)
- `GET /routes/{id}?lang=fr`
- `GET /waypoints?q={query}&limit=10&lang=fr`
- `GET /waypoints?a={area_id}&limit=10&lang=fr` (combinable with `q`)
- `GET /waypoints/{id}?lang=fr`
- `GET /outings?u={user_id}&limit=10&lang=fr`
- `GET /outings/{id}?lang=fr`
- `GET /outings?sort=-date_end&limit=10&offset=0&lang=fr[&q={query}][&a={area_id}][&act={activity}][&date={from},{to}][&r={route_id}][&w={waypoint_id}]`
- `GET /areas?q={query}&limit=10&lang=fr[&atyp={type}]`
- `GET /areas/{id}?lang=fr`
- `GET /books?q={query}&limit=10&lang=fr`
- `GET /books/{id}?lang=fr`
