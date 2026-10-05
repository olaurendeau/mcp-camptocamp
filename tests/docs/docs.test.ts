import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ROOT,
  SELF_HOSTED_URL,
  checkJsonBlocks,
  checkLinks,
  checkMcpServers,
  checkNames,
  checkNodeVersion,
  checkSources,
  checkSupportMatrix,
  checkTokenLiterals,
  fencedBlocks,
  headingSlugs,
  inlineCodeSpans,
  jsonBlocks,
  links,
  listMarkdownFiles,
  section,
  slugify,
} from "./markdown.js";

const DOCS = join(ROOT, "docs");
const README = join(ROOT, "README.md");
const INDEX = join(DOCS, "README.md");
const REMOTE_ONLY = join(DOCS, "clients", "remote-only.md");
const SELF_HOSTING = join(DOCS, "self-hosting.md");
const docFiles = listMarkdownFiles(DOCS);
const checkedFiles = [...docFiles, README];
const engines = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { engines: { node: string } }).engines
  .node;

function read(file: string): string {
  return readFileSync(file, "utf8");
}

/** Runs `check` on every file and prefixes each problem with the file's path from the repo root. */
function problemsIn(files: string[], check: (file: string, text: string) => string[]): string[] {
  return files.flatMap((file) => check(file, read(file)).map((problem) => `${relative(ROOT, file)}: ${problem}`));
}

const fence = "```";
const STDIO_OR_HTTP =
  "camptocamp must run npx -y @olaurendeau/mcp-camptocamp or docker run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:latest, " +
  'or be an HTTP entry for https://mcp.example.org/mcp with headers.Authorization "Bearer ${VAR}" and no command';

/** A json block declaring `server` as the camptocamp entry of mcpServers. */
function serverBlock(server: Record<string, unknown>): string {
  return [fence + "json", JSON.stringify({ mcpServers: { camptocamp: server } }), fence].join("\n");
}

describe("markdown helpers", () => {
  it("lists the Markdown files under a folder, recursively and sorted", () => {
    const files = listMarkdownFiles(DOCS).map((file) => relative(DOCS, file));

    expect(files).toContain("README.md");
    expect(files).toContain("getting-started.md");
    expect(files).toEqual([...files].sort());
    expect(files.every((file) => file.endsWith(".md"))).toBe(true);
  });

  it("slugs headings like GitHub", () => {
    expect(slugify("Quick start (npx)")).toBe("quick-start-npx");
    expect(slugify("`search_routes` needs a filter")).toBe("search_routes-needs-a-filter");
    expect(slugify("Protection de `main`")).toBe("protection-de-main");
    expect(slugify("Écrins, Vanoise & co.")).toBe("écrins-vanoise--co");
    expect(slugify("See [the guide](guide.md)")).toBe("see-the-guide");
  });

  it("gives a duplicate heading the suffix -1, then -2", () => {
    const text = ["# Title", "## Setup", "text", "## Setup", "## Setup"].join("\n");

    expect(headingSlugs(text)).toEqual(["title", "setup", "setup-1", "setup-2"]);
  });

  it("ignores headings inside fenced blocks", () => {
    const text = ["## Real", fence + "sh", "# not a heading", fence].join("\n");

    expect(headingSlugs(text)).toEqual(["real"]);
  });

  it("returns fenced blocks with their language and first content line", () => {
    const text = [
      "intro",
      fence + "json",
      "{}",
      fence,
      "",
      "  ~~~toml",
      "  a = 1",
      "  ~~~",
      fence,
      "plain",
      fence,
    ].join("\n");

    expect(fencedBlocks(text)).toEqual([
      { lang: "json", content: "{}", line: 3 },
      { lang: "toml", content: "  a = 1", line: 7 },
      { lang: "", content: "plain", line: 10 },
    ]);
    expect(fencedBlocks(text, "json")).toEqual([{ lang: "json", content: "{}", line: 3 }]);
  });

  it("returns inline code spans, outside fenced blocks", () => {
    const text = ["Run `npx -y x` or ``a ` b``.", fence, "`not inline`", fence].join("\n");

    expect(inlineCodeSpans(text)).toEqual(["npx -y x", "a ` b"]);
  });

  it("returns link and image targets, and reference definitions", () => {
    const text = [
      "See [the guide](guide.md#setup), ![logo](img/logo.png) and [home](https://example.com 'Home').",
      "A [spaced](<my file.md>) link.",
      "",
      "[ref]: ../CONTRIBUTING.md",
    ].join("\n");

    expect(links(text)).toEqual([
      "guide.md#setup",
      "img/logo.png",
      "https://example.com",
      "my file.md",
      "../CONTRIBUTING.md",
    ]);
  });

  it("ignores links inside fenced blocks, inline code and HTML comments", () => {
    const text = [
      "`[inline](missing-inline.md)`",
      fence + "md",
      "[fenced](missing-fenced.md)",
      fence,
      "<!-- [comment](missing-comment.md) -->",
      "[kept](kept.md)",
    ].join("\n");

    expect(links(text)).toEqual(["kept.md"]);
  });
});

describe("docs checks fail on bad fixtures", () => {
  const page = join(DOCS, "fixture.md");

  it("a relative link to a missing file", () => {
    expect(checkLinks(page, "[gone](no-such-page.md)")).toEqual(["no-such-page.md: no such file"]);
  });

  it("an absolute link path, or a link that leaves the repository", () => {
    expect(checkLinks(page, "[root](/docs/README.md) [out](../../outside.md)")).toEqual([
      "/docs/README.md: use a relative link, not a path from the site root",
      "../../outside.md: points outside the repository",
    ]);
  });

  it("an anchor that is not a heading of the target page", () => {
    expect(checkLinks(page, "[bad](getting-started.md#no-such-heading)")).toEqual([
      "getting-started.md#no-such-heading: no heading with this anchor",
    ]);
  });

  it("an anchor that is not a heading of the same page", () => {
    expect(checkLinks(page, "## Here\n\n[up](#here) [bad](#there)")).toEqual(["#there: no heading with this anchor"]);
  });

  it("accepts existing files, folders, anchors and external URLs", () => {
    const text = [
      "## Here",
      "[a](getting-started.md#quick-start-npx) [b](../src/) [c](#here) [d](../CONTRIBUTING.md#release)",
      "[e](https://example.com/x#y) [f](mailto:someone@example.com) [g](../package.json#L1)",
    ].join("\n");

    expect(checkLinks(page, text)).toEqual([]);
  });

  it("an invalid json, JSON or jsonc block", () => {
    const blocks = [
      fence + "json",
      '{"a": 1,}',
      fence,
      fence + "JSON",
      "{a: 1}",
      fence,
      fence + "jsonc",
      '{"a" // 1',
      fence,
    ];
    const problems = checkJsonBlocks(["text", ...blocks].join("\n"));

    expect(problems.map((problem) => problem.replace(/: .*/, ""))).toEqual(
      [3, 6, 9].map((n) => `json block at line ${n}`),
    );
  });

  it("parses a jsonc block once its comments are removed, but not comments inside strings", () => {
    const text = [
      fence + "JSONC",
      "// settings.json",
      "{",
      '  "url": "https://example.com/a//b", /* inline */',
      '  "quote": "a \\" // still a string", // trailing',
      "  /* block",
      "     comment */",
      '  "n": 1',
      "}",
      fence,
    ].join("\n");

    expect(checkJsonBlocks(text)).toEqual([]);
    expect(jsonBlocks(text).map((block) => block.value)).toEqual([
      { url: "https://example.com/a//b", quote: 'a " // still a string', n: 1 },
    ]);
  });

  it("an mcpServers block with another server name, a wrong image tag or npx without -y, in json, jsonc or JSON", () => {
    const args = ["-y", "@olaurendeau/mcp-camptocamp"];
    const json = JSON.stringify({ mcpServers: { "camptocamp-server": { command: "npx", args } } });
    const jsonc = ["// comment", JSON.stringify({ mcpServers: { other: { command: "npx", args } } })].join("\n");
    const image = "ghcr.io/olaurendeau/mcp-camptocamp:1.3.0";
    const upper = JSON.stringify({
      mcpServers: { camptocamp: { command: "docker", args: ["run", "--rm", "-i", image] } },
    });
    const noYes = JSON.stringify({ mcpServers: { camptocamp: { command: "npx", args: args.slice(1) } } });
    const text = [json, jsonc, upper, noYes].map((block, n) =>
      [fence + ["json", "jsonc", "JSON", "json"][n], block, fence].join("\n"),
    );

    expect(checkMcpServers(text.join("\n"))).toEqual([
      'mcpServers at line 2: expected the single key "camptocamp", got "camptocamp-server"',
      'mcpServers at line 5: expected the single key "camptocamp", got "other"',
      `mcpServers at line 9: ${STDIO_OR_HTTP}`,
      `mcpServers at line 12: ${STDIO_OR_HTTP}`,
    ]);
  });

  it("accepts the npx and Docker variants, with extra keys such as env", () => {
    const npx = {
      mcpServers: { camptocamp: { command: "npx", args: ["-y", "@olaurendeau/mcp-camptocamp"], env: {} } },
    };
    const docker = {
      mcpServers: {
        camptocamp: { command: "docker", args: ["run", "--rm", "-i", "ghcr.io/olaurendeau/mcp-camptocamp:latest"] },
      },
    };
    const text = [fence + "json", JSON.stringify(npx), fence, fence + "json", JSON.stringify(docker), fence].join("\n");

    expect(checkMcpServers(text)).toEqual([]);
  });

  it("accepts an HTTP entry for the self-hosted URL whose token comes from an env var, as url or httpUrl", () => {
    const blocks = [
      serverBlock({ type: "http", url: SELF_HOSTED_URL, headers: { Authorization: "Bearer ${CAMPTOCAMP_MCP_TOKEN}" } }),
      serverBlock({ httpUrl: SELF_HOSTED_URL, headers: { Authorization: "Bearer $CAMPTOCAMP_MCP_TOKEN" } }),
    ];

    expect(checkMcpServers(blocks.join("\n"))).toEqual([]);
  });

  it("an HTTP entry with a literal token, no header, another host, an unclosed ${, or a command", () => {
    const header = { Authorization: "Bearer ${CAMPTOCAMP_MCP_TOKEN}" };
    const blocks = [
      serverBlock({ type: "http", url: SELF_HOSTED_URL, headers: { Authorization: `Bearer ${"0f".repeat(32)}` } }),
      serverBlock({ type: "http", url: SELF_HOSTED_URL }),
      serverBlock({ type: "http", url: SELF_HOSTED_URL, headers: { "X-Api-Key": "${CAMPTOCAMP_MCP_TOKEN}" } }),
      serverBlock({ type: "http", url: "https://mcp.example.com/mcp", headers: header }),
      serverBlock({ httpUrl: SELF_HOSTED_URL, headers: { Authorization: "Bearer ${CAMPTOCAMP_MCP_TOKEN" } }),
      serverBlock({ command: "npx", url: SELF_HOSTED_URL, headers: header }),
    ];

    expect(checkMcpServers(blocks.join("\n"))).toEqual(
      [2, 5, 8, 11, 14, 17].map((line) => `mcpServers at line ${line}: ${STDIO_OR_HTTP}`),
    );
  });

  it("a literal bearer token anywhere, but not a token read from an env var", () => {
    const token = "0f".repeat(32);
    const text = [
      `curl -H "Authorization: Bearer ${token}"`,
      "Bearer ${CAMPTOCAMP_MCP_TOKEN} and Bearer $CAMPTOCAMP_MCP_TOKEN",
      `| Authorization | bearer ${token.slice(0, 19)} |`,
      `"Authorization": "Bearer ${token}=="`,
      'WWW-Authenticate: Bearer realm="mcp-camptocamp", error="invalid_token"',
    ].join("\n");
    const problems = checkTokenLiterals(text);

    expect(problems).toEqual([
      "line 1: a literal bearer token; use an env var",
      "line 4: a literal bearer token; use an env var",
    ]);
    expect(problems.join("\n")).not.toContain(token.slice(0, 8));
  });

  it("a literal MCP_AUTH_TOKENS value anywhere, but not one read from a variable or a command", () => {
    const token = "0f".repeat(32);
    const text = [
      `MCP_AUTH_TOKENS=${token}`,
      "-e MCP_AUTH_TOKENS and MCP_AUTH_TOKENS=$TOKENS or MCP_AUTH_TOKENS=${TOKENS}",
      `docker run -e MCP_AUTH_TOKENS="${token},${token}" image`,
      `printf 'MCP_AUTH_TOKENS=%s\\n' "$(openssl rand -hex 32)" and MCP_AUTH_TOKENS=${token.slice(0, 19)}`,
      `      - 'MCP_AUTH_TOKENS=${token}='`,
      "`MCP_AUTH_TOKENS: token 1 is shorter than 32 characters`",
    ].join("\n");
    const problems = checkTokenLiterals(text);

    expect(problems).toEqual([
      "line 1: a literal MCP_AUTH_TOKENS value; use an env var",
      "line 3: a literal MCP_AUTH_TOKENS value; use an env var",
      "line 5: a literal MCP_AUTH_TOKENS value; use an env var",
    ]);
    expect(problems.join("\n")).not.toContain(token.slice(0, 8));
  });

  it("a wrong image tag in prose", () => {
    expect(checkNames("Run `docker run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:1.3.0`.")).toEqual([
      'unexpected name "ghcr.io/olaurendeau/mcp-camptocamp:1.3.0"',
    ]);
  });

  it("a misspelt package name or a pinned version", () => {
    expect(checkNames("npx -y olaurendeau/mcp-camptocamp, npx @olaurendeau/mcp-camptocamp@1.3.0")).toEqual([
      'unexpected name "olaurendeau/mcp-camptocamp"',
      'unexpected name "@olaurendeau/mcp-camptocamp@1.3.0"',
    ]);
  });

  it("accepts the package, the image, the local image, the registry name, the server name and the repository URLs", () => {
    const text = [
      "`npx -y @olaurendeau/mcp-camptocamp`, `docker pull ghcr.io/olaurendeau/mcp-camptocamp:latest`.",
      "`docker compose build mcp` tags the local image `mcp-camptocamp-mcp`.",
      "Registry name io.github.olaurendeau/mcp-camptocamp; serverInfo name mcp-camptocamp.",
      "[repo](https://github.com/olaurendeau/mcp-camptocamp/issues) and https://github.com/olaurendeau/mcp-camptocamp.",
    ].join("\n");

    expect(checkNames(text)).toEqual([]);
  });

  it("a Node version other than engines.node, however it is named", () => {
    const text = [
      "Install Node 20 or later, Node.js 18, Node >= 20, node@20, Node>=20 or Node v20.",
      "Tested on Node.js versions 18 and 20, Node.js version 24, Node 22 or 24, node:20-alpine.",
      "Install [Node.js](https://nodejs.org/en/download) 20 or later.",
    ].join("\n");
    const problems = checkNodeVersion(text, ">=22");

    expect(problems[0]).toBe('Node 20: engines.node in package.json is ">=22"');
    expect(problems.map((problem) => problem.replace(/: engines\.node .*/, ""))).toEqual([
      "Node 20",
      "Node.js 18",
      "Node >= 20",
      "node@20",
      "Node>=20",
      "Node v20",
      "Node.js versions 18 and 20",
      "Node.js version 24",
      "Node 22 or 24",
      "node:20",
      "Node.js](https://nodejs.org/en/download) 20",
    ]);
    expect(checkNodeVersion("Install Node.js 22 or later; check with `node --version`.", ">=22")).toEqual([]);
  });

  it('accepts versions below the minimum after the phrase "older Node.js versions", and only those', () => {
    expect(checkNodeVersion("With the older Node.js versions 18 and 20, npx ran v1.2.0.", ">=22")).toEqual([]);
    expect(checkNodeVersion("Older  node.JS\nVersions 18 and 20 run v1.2.0.", ">=22")).toEqual([]);
    expect(checkNodeVersion("With the older Node.js versions 20 and 22, npx ran v1.2.0.", ">=22")).toEqual([
      'older Node.js versions 20 and 22: "older Node.js versions" must name versions below 22',
    ]);
  });

  it("an engines.node it cannot read", () => {
    expect(() => checkNodeVersion("Node 22", "^22")).toThrow('Unsupported engines.node "^22"');
  });

  it("a client page without a Sources list or a Last verified line", () => {
    expect(checkSources("# Client\n\nText.")).toEqual([
      'no "## Sources" section',
      'no line "Last verified: YYYY-MM-DD against official docs"',
    ]);
    expect(checkSources("## Sources\n\n- none\n\nLast verified: 2026-10-04 against official docs")).toEqual([
      "the Sources section has no https URL",
    ]);
    expect(
      checkSources("## Sources\n\n- https://example.com/docs\n\nLast verified: 2026-10 against official docs"),
    ).toEqual(['no line "Last verified: YYYY-MM-DD against official docs"']);
    expect(
      checkSources("## Sources\n\n- https://example.com/docs\n\nLast verified: 2026-10-04 against official docs\n"),
    ).toEqual([]);
  });

  const pageA = join(DOCS, "a.md");
  const pageB = join(DOCS, "clients", "b.md");
  const fixturePages: Partial<Record<string, string>> = {
    [pageA]: "# A\n\nLast verified: 2026-03-01 against official docs\n",
    [pageB]: "# B\n\nLast verified: 2026-03-02 against official docs\n",
  };
  const readFixture = (path: string): string | undefined => fixturePages[path];
  const matrixHead = "## Support matrix\n\n| Client | Works? | Page | Last verified |\n| --- | --- | --- | --- |";

  it("a support matrix that is missing, or has other columns", () => {
    expect(checkSupportMatrix(INDEX, "## Clients", [], readFixture)).toEqual(['no "## Support matrix" section']);
    expect(checkSupportMatrix(INDEX, "## Support matrix\n\n| Client | Page |\n| --- | --- |", [], readFixture)).toEqual(
      ["expected the columns Client, Works?, Page, Last verified, got Client, Page"],
    );
  });

  it("a row without a page link, another date, a missing cell, a missing page, and a page without a row", () => {
    const text = [
      matrixHead,
      "| A | Yes | none | 2026-03-01 |",
      "| B | Yes | [page](clients/b.md#setup) | 2026-01-01 |",
      "| C | Yes | [page](a.md) |",
      "| D | Yes | [page](no-such-page.md) | 2026-03-01 |",
    ].join("\n");

    expect(checkSupportMatrix(INDEX, text, [pageA, pageB], readFixture)).toEqual([
      'row "A": no link to a page',
      'row "B": Last verified 2026-01-01, but docs/clients/b.md says 2026-03-02',
      'row "C": expected 4 cells, got 3',
      'row "D": Last verified 2026-03-01, but docs/no-such-page.md says nothing',
      "docs/a.md: no row links this page",
    ]);
  });

  it("an anchor-only link reads the index itself, without opening its folder", () => {
    const text = [matrixHead, "| A | Yes | [here](#support-matrix) | 2026-03-01 |"].join("\n");

    expect(checkSupportMatrix(INDEX, text, [], readFixture)).toEqual([
      'row "A": Last verified 2026-03-01, but docs/README.md says nothing',
    ]);
    expect(checkSupportMatrix(INDEX, `${text}\n\nLast verified: 2026-03-01 against official docs`, [])).toEqual([]);
  });

  it("accepts a support matrix whose rows link the pages with their Last verified date", () => {
    const text = [
      matrixHead,
      "| A | Yes | [A](a.md) | 2026-03-01 |",
      "| B | Yes | [B](clients/b.md#setup) | 2026-03-02 |",
      "",
      "## Next",
    ].join("\n");

    expect(checkSupportMatrix(INDEX, text, [pageA, pageB], readFixture)).toEqual([]);
  });
});

describe("docs/ and README.md", () => {
  it("checks the docs index, getting started and troubleshooting pages at least", () => {
    for (const page of ["README.md", "getting-started.md", "troubleshooting.md"]) {
      expect(existsSync(join(DOCS, page)), page).toBe(true);
    }
  });

  it("resolve every relative link and anchor", () => {
    expect(problemsIn(checkedFiles, checkLinks)).toEqual([]);
  });

  it("parse every json block", () => {
    expect(problemsIn(checkedFiles, (_file, text) => checkJsonBlocks(text))).toEqual([]);
  });

  it("declare mcpServers only as camptocamp, with the npx or Docker command or the self-hosted URL", () => {
    expect(problemsIn(checkedFiles, (_file, text) => checkMcpServers(text))).toEqual([]);
  });

  it("never print a literal bearer token or MCP_AUTH_TOKENS value", () => {
    expect(problemsIn(checkedFiles, (_file, text) => checkTokenLiterals(text))).toEqual([]);
  });

  it("give the Node version of engines.node", () => {
    expect(problemsIn(checkedFiles, (_file, text) => checkNodeVersion(text, engines))).toEqual([]);
  });

  it("spell the package and image names one way under docs/", () => {
    expect(problemsIn(docFiles, (_file, text) => checkNames(text))).toEqual([]);
  });

  it("end each client and SDK page and the self-hosting guide with Sources and a Last verified line", () => {
    const sourced = docFiles.filter((file) => {
      const path = relative(DOCS, file);
      return path.startsWith("clients/") || path === "agent-sdks.md" || path === "self-hosting.md";
    });

    expect(sourced).toContain(SELF_HOSTING);
    expect(problemsIn(sourced, (_file, text) => checkSources(text))).toEqual([]);
  });
});

describe("pages", () => {
  it("the README links the docs index", () => {
    expect(links(read(README))).toContain("docs/README.md");
  });

  it("the docs index has the Start here, Clients, Guides and Tool reference sections", () => {
    expect(headingSlugs(read(join(DOCS, "README.md")))).toEqual(
      expect.arrayContaining(["start-here", "clients", "guides", "tool-reference"]),
    );
  });

  it("the docs index has a support matrix that links every client page and the agent SDK guide", () => {
    const pages = [...listMarkdownFiles(join(DOCS, "clients")), join(DOCS, "agent-sdks.md")];

    expect(checkSupportMatrix(INDEX, read(INDEX), pages)).toEqual([]);
  });

  it("the support matrix rows of Claude.ai and Vibe Work link the self-hosting guide first", () => {
    const rows = (section(read(INDEX), "Support matrix") ?? "").split("\n").filter((line) => line.startsWith("|"));

    for (const client of ["Claude.ai custom connectors", "Vibe Work"]) {
      const row = rows.find((line) => line.slice(1).trim().startsWith(client));
      const page = row?.split("|")[3] ?? "";

      expect(row, client).toBeDefined();
      expect(links(page)[0]?.replace(/#.*/, ""), client).toBe("self-hosting.md");
    }
  });

  it("the remote-only page links the self-hosting guide from its Claude.ai and Vibe Work sections", () => {
    const text = read(REMOTE_ONLY);

    for (const title of ["Claude.ai custom connectors", "Vibe Work (formerly Le Chat)"]) {
      const targets = links(section(text, title) ?? "").map((link) => link.replace(/#.*/, ""));

      expect(targets, title).toContain("../self-hosting.md");
    }
  });

  it("the self-hosting guide gives the token, docker run, Caddyfile and check commands", () => {
    const text = read(SELF_HOSTING);
    // Continuation lines joined, so a command split over several lines reads as one.
    const code = fencedBlocks(text)
      .map((block) => block.content.replace(/\\\n\s*/g, ""))
      .join("\n");

    for (const snippet of [
      "openssl rand -hex 32",
      "docker run -d --restart unless-stopped --name camptocamp -e MCP_TRANSPORT=http -e MCP_AUTH_TOKENS " +
        "-e MCP_ALLOWED_HOSTS=mcp.example.org -e MCP_OPERATOR_CONTACT -p 127.0.0.1:3000:3000 --read-only --cap-drop ALL " +
        "ghcr.io/olaurendeau/mcp-camptocamp:latest",
      "curl -sS https://mcp.example.org/healthz",
      "curl -sS -i -X POST https://mcp.example.org/mcp",
      "Accept: application/json, text/event-stream",
      '"method":"initialize"',
      "docker stop -t 10 camptocamp",
      "stop_grace_period: 10s",
    ]) {
      expect(code, snippet).toContain(snippet);
    }
    expect(fencedBlocks(text, "caddyfile").map((block) => block.content)).toContain(
      "mcp.example.org\nreverse_proxy 127.0.0.1:3000",
    );
    expect(code).toContain("HTTP/2 401");
    expect(text).toContain("v1.4.0 or later");
  });

  it("the remote-only page quotes a source for 6 surfaces, links a local alternative, and has no recipe", () => {
    const text = read(REMOTE_ONLY);
    const surfaces = text
      .split(/^## /m)
      .slice(1)
      .filter(
        (part) => /^> /m.test(part) && /https:\/\//.test(part) && links(part).some((link) => /\.md(#|$)/.test(link)),
      );

    expect(surfaces.map((part) => part.split("\n")[0])).toHaveLength(6);
    expect(section(text, "Gemini app (gemini.google.com)")).toMatch(
      /no official MCP documentation found \(\d{4}-\d{2}-\d{2}\)/,
    );
    expect(fencedBlocks(text)).toEqual([]);
  });

  it("getting started gives the launch, pre-warm, smoke-test and Claude Code commands", () => {
    const code = fencedBlocks(read(join(DOCS, "getting-started.md")))
      .map((block) => block.content)
      .join("\n");

    for (const command of [
      "npx -y @olaurendeau/mcp-camptocamp",
      "docker run --rm -i ghcr.io/olaurendeau/mcp-camptocamp:latest",
      "docker pull ghcr.io/olaurendeau/mcp-camptocamp:latest",
      '"method":"tools/list"',
      "claude mcp add --transport stdio --scope user camptocamp -- npx -y @olaurendeau/mcp-camptocamp",
    ]) {
      expect(code, command).toContain(command);
    }
  });

  it("troubleshooting covers the 8 symptoms", () => {
    const text = read(join(DOCS, "troubleshooting.md"));

    for (const symptom of [
      "startup_timeout_sec", // first-run npx timeout
      "node --version", // Node older than 22
      "docker run --rm -i", // Docker without -i
      "--skip-trust", // Gemini CLI untrusted folder
      "~/Library/Logs/Claude", // Claude Desktop logs and restart
      "ENOENT", // Windows %APPDATA%
      "MAX_MCP_OUTPUT_TOKENS", // Claude Code output warning
      "codex mcp list", // status per client
    ]) {
      expect(text, symptom).toContain(symptom);
    }
  });
});
