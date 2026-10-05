# Development

How to work on the server itself. The rules every change follows (pull requests, reviews, thresholds, releases) are in [CONTRIBUTING.md](../CONTRIBUTING.md), in French.

## Prerequisites

[Docker](https://docs.docker.com/get-started/get-docker/) and [Docker Compose](https://docs.docker.com/compose/). Every npm command runs in a container through the `Makefile`, so no local Node.js is needed.

## Make targets

```sh
make install       # Install the dependencies
make check         # Same steps as the CI checks job: format, lint, types, coverage, build, hook tests
make test          # Run the tests
make test-contract # Contract tests against the live Camptocamp API (npm run test:contract; needs the network; not in make check)
make lint          # ESLint
make typecheck     # Type check
make test-watch    # Tests in watch mode
make build         # Compile TypeScript
make docker-build  # Build the production image
make help          # List every target
```

`make check` enforces the coverage thresholds of `vitest.config.ts`: 95 % of lines, functions and statements, and 90 % of branches, measured on `src/`.

## Contract tests

The contract tests call the live Camptocamp API to catch changes in its responses. Besides `make test-contract`, they run every Monday through the `Contract` workflow (`.github/workflows/contract.yml`), on its schedule or when started by hand. The workflow is never required on a pull request.

- GitHub disables scheduled workflows after 60 days without activity in the repository, so a missing weekly run does not mean a passing one. GitHub refuses to start a disabled workflow by hand: enable it first (`gh workflow enable contract.yml`, or the Actions tab), then start it with `gh workflow run contract.yml`.
- Failures of scheduled runs are notified to the user who last changed the `cron` line (after a squash merge, the author of that commit on `main`) or, if the workflow was re-enabled, to the user who re-enabled it.

## Local image

`docker compose build mcp` builds the production image locally as `mcp-camptocamp-mcp`, the `image` name that `docker-compose.yml` gives the `mcp` service. Use `mcp-camptocamp-mcp` in your client's configuration in place of `ghcr.io/olaurendeau/mcp-camptocamp:latest`.

## Releases

Publishing is automated: pushing a `vX.Y.Z` tag starts the `publish.yml` workflow, which publishes to npm, GHCR and the [official MCP registry](https://modelcontextprotocol.io/registry). Nothing is published by hand. The process (version bump pull request, merge, tag) is in the [Release section of CONTRIBUTING.md](../CONTRIBUTING.md#release).

## Stack

- **Runtime**: Node.js 22 or later (`engines.node` in `package.json`) and TypeScript. CI runs the checks on each Node.js major of its matrix (22 and 24).
- **MCP SDK**: `@modelcontextprotocol/sdk`.
- **Transport**: stdio.
- **Tests**: Vitest.
- **Docker**: a multi-stage image based on `node:22-alpine`, built for amd64 and arm64, that runs as the non-root user `node`.
