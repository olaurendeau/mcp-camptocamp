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
    └── waypoints.ts      # Tools: search_waypoints, get_waypoint
tests/
├── api/
│   └── camptocamp.test.ts  # Unit tests with mocked fetch
└── tools/
    ├── routes.test.ts      # Tool handler unit tests
    └── waypoints.test.ts   # Tool handler unit tests
```

The tool handlers in `src/tools/` are pure functions (no SDK coupling) — they take typed inputs and return formatted strings, making them easy to test in isolation.

## Docker Commands

All development happens inside Docker — no local Node.js required.

```bash
# Install dependencies (first time or after package.json changes)
docker compose run --rm dev npm install

# Everything CI runs (format, lint, typecheck, coverage, build)
make check

# Run tests
docker compose run --rm dev npm test

# Watch mode during development
docker compose run --rm dev npm run test:watch

# Build production image
docker compose build mcp
```

## Workflow

Every change lands through a PR; the rules and thresholds live in [CONTRIBUTING.md](CONTRIBUTING.md). Read it before opening a PR.

- Work on a branch, keep each PR to one concern and ≤ 1000 changed lines (excluding `package-lock.json`); split larger work into a sequence of PRs.
- Run `make check` before pushing.
- Title the PR in Conventional Commits form and fill `.github/pull_request_template.md`.
- After opening or pushing to a PR, dispatch the `pr-reviewer` subagent with the PR number. Its review is the only source of the `agent-review` status; your part is to address its blocking findings with new commits, then dispatch it again on the new head.

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

| Tool               | Description                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `search_routes`    | Search mountain routes by keyword, returns list with ID, title, activities, elevation, rating |
| `get_route`        | Get full route detail by ID (description, ratings, elevation data, gear)                      |
| `search_waypoints` | Search waypoints (summits, huts, bivouacs) by name                                            |
| `get_waypoint`     | Get waypoint detail by ID (altitude, GPS coordinates, description)                            |

## Camptocamp API v6

Base URL: `https://api.camptocamp.org`

- `GET /routes?q={query}&limit=10&lang=fr`
- `GET /routes/{id}?lang=fr`
- `GET /waypoints?q={query}&limit=10&lang=fr`
- `GET /waypoints/{id}?lang=fr`
