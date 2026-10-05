// The README is what GitHub, npm and the MCP registry show: short, in English, with its quick start copied from
// docs/getting-started.md (AC20), one line per tool (AC15), the approved badges (AC17), and every detail it used
// to hold now under docs/ (AC16).
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { listRegisteredTools } from "../../scripts/docs/inputs.js";
import { ROOT, fencedBlocks, links, listMarkdownFiles, section } from "./markdown.js";

const DOCS = join(ROOT, "docs");
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const gettingStarted = readFileSync(join(DOCS, "getting-started.md"), "utf8");
const names = (await listRegisteredTools()).map((tool) => tool.name);

/** The `## ` headings of `text`, in order. */
function sections(text: string): string[] {
  return [...text.matchAll(/^## (.+)$/gm)].map(([, title]) => title.trim());
}

/** The body of the `## <title>` section of the README; fails the test when the section is missing. */
function readmeSection(title: string): string {
  const body = section(readme, title);
  expect(body, `README section "## ${title}"`).toBeDefined();
  return body ?? "";
}

const REPO = "https://github.com/olaurendeau/mcp-camptocamp";
const NPM = "https://www.npmjs.com/package/@olaurendeau/mcp-camptocamp";
const REGISTRY_API =
  "https://registry.modelcontextprotocol.io/v0/servers/io.github.olaurendeau%2Fmcp-camptocamp/versions/latest";

/** D8: the 8 approved badges, each image with the page it links to. */
const BADGES: [image: string, target: string][] = [
  [`${REPO}/actions/workflows/ci.yml/badge.svg?branch=main`, `${REPO}/actions/workflows/ci.yml`],
  [`${REPO}/actions/workflows/contract.yml/badge.svg`, `${REPO}/actions/workflows/contract.yml`],
  ["https://img.shields.io/npm/v/@olaurendeau/mcp-camptocamp", NPM],
  ["https://img.shields.io/npm/dm/@olaurendeau/mcp-camptocamp", NPM],
  [
    "https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.modelcontextprotocol.io%2Fv0%2Fservers%2Fio.github.olaurendeau%252Fmcp-camptocamp%2Fversions%2Flatest&query=%24.server.version&label=MCP%20registry",
    REGISTRY_API,
  ],
  ["https://img.shields.io/node/v/@olaurendeau/mcp-camptocamp", NPM],
  ["https://img.shields.io/github/license/olaurendeau/mcp-camptocamp", "LICENSE"],
  [
    "https://img.shields.io/badge/ghcr.io-amd64%20%7C%20arm64-2496ED?logo=docker&logoColor=white",
    `${REPO}/pkgs/container/mcp-camptocamp`,
  ],
];

/** `[![alt](image)](target)` pairs of `text`, as [image, target]. */
function badgesIn(text: string): [string, string][] {
  return [...text.matchAll(/\[!\[[^\]]*\]\(([^)\s]+)\)\]\(([^)\s]+)\)/g)].map(([, image, target]) => [image, target]);
}

/** AC16: a sentinel string for each kind of detail the old README held, which must now be under docs/. */
const SENTINELS = [
  "**Capacity (unstaffed)**",
  "Next page: offset=",
  "limit at most",
  "[begin user-written text:",
  "**Language**:",
  "10,000",
  "not shown: Camptocamp sent",
  "virtual",
  "Ski rating (Toponeige)",
  "condition_at_least",
  "book_type",
  "More: search_routes with waypoint_id=",
  "Lift access",
];

describe("README", () => {
  it("has 150 lines or fewer (AC15)", () => {
    expect(readme.trimEnd().split("\n").length).toBeLessThanOrEqual(150);
  });

  it("keeps the MCP registry marker (AC21)", () => {
    expect(readme).toContain("<!-- mcp-name: io.github.olaurendeau/mcp-camptocamp -->");
  });

  it("has the title, a pitch and the badges, then the sections in the epic's order (AC15)", () => {
    const firstSection = readme.indexOf("\n## ");
    const head = readme.slice(0, firstSection);

    expect(head.split("\n")[0]).toBe("# mcp-camptocamp");
    expect(badgesIn(head)).toHaveLength(BADGES.length);
    expect(sections(readme)).toEqual([
      "What it does",
      "Quick start",
      "Supported clients",
      "Tools",
      "Guides",
      "Development",
      "License",
    ]);
  });

  it("is in English: none of the old French headings is left (D6)", () => {
    for (const heading of ["Outils disponibles", "Installation", "Développement", "Publication", "Stack technique"]) {
      expect(readme).not.toContain(heading);
    }
  });

  it("shows exactly the 8 approved badges, each linking to its page (AC17, D8)", () => {
    expect(badgesIn(readme)).toEqual(BADGES);
  });

  it("copies every quick-start block verbatim from docs/getting-started.md (AC20)", () => {
    const blocks = fencedBlocks(readmeSection("Quick start"));
    const reference = fencedBlocks(gettingStarted).map(({ lang, content }) => `${lang}\n${content}`);

    expect(blocks.map((block) => block.lang)).toEqual(["json", "sh", "json"]);
    for (const { lang, content } of blocks) {
      expect(reference, `${lang} block:\n${content}`).toContain(`${lang}\n${content}`);
    }
  });

  it("names the server's MCP registry entry, without a one-click install claim", () => {
    const quickStart = readmeSection("Quick start");

    expect(quickStart).toContain("`io.github.olaurendeau/mcp-camptocamp`");
    expect(quickStart).not.toMatch(/one-click|1-click/i);
  });

  it("links every client page and the agent SDK guide", () => {
    const pages = [...listMarkdownFiles(join(DOCS, "clients")), join(DOCS, "agent-sdks.md")].map((page) =>
      relative(ROOT, page),
    );
    const linked = links(readmeSection("Supported clients")).map((target) => target.replace(/#.*$/, ""));

    expect([...new Set(linked.filter((target) => pages.includes(target)))].sort()).toEqual(pages.sort());
  });

  it("lists each registered tool once, on one line, linking its docs/tools page", () => {
    const toolLinks = links(readme).filter((target) => /^docs\/tools\/(?!README\.md$)[^/]+\.md$/.test(target));
    const lines = readmeSection("Tools")
      .split("\n")
      .filter((line) => /\(docs\/tools\/(?!README\.md\))/.test(line));

    expect(toolLinks).toHaveLength(13);
    expect(toolLinks.sort()).toEqual(names.map((name) => `docs/tools/${name}.md`).sort());
    expect(lines).toHaveLength(13);
  });

  it("has no per-tool behaviour paragraph: tools are named only in the Tools section (AC15)", () => {
    const outsideTools = readme.replace(readmeSection("Tools"), "");

    for (const name of names) {
      expect(outsideTools, name).not.toContain(`\`${name}\``);
    }
  });

  it("links the docs index, the LLM guide, the system prompt and CONTRIBUTING (AC1)", () => {
    expect(links(readme)).toEqual(expect.arrayContaining(["docs/README.md"]));
    expect(links(readmeSection("Guides"))).toEqual(
      expect.arrayContaining(["docs/using-with-llms.md", "docs/system-prompt.md"]),
    );
    expect(links(readmeSection("Development"))).toContain("CONTRIBUTING.md");
  });

  it("states the coverage thresholds that vitest.config.ts enforces (D8)", () => {
    const config = readFileSync(join(ROOT, "vitest.config.ts"), "utf8");
    const threshold = (metric: string): string => new RegExp(`\\b${metric}: (\\d+)`).exec(config)?.[1] ?? "";
    const development = readmeSection("Development");

    expect(threshold("lines")).not.toBe("");
    expect(threshold("functions")).toBe(threshold("lines"));
    expect(threshold("statements")).toBe(threshold("lines"));
    expect(development).toContain(`${threshold("lines")} %`);
    expect(development).toContain(`${threshold("branches")} %`);
  });
});

describe("nothing lost from the old README (AC16)", () => {
  const docs = listMarkdownFiles(DOCS).map((file) => readFileSync(file, "utf8"));

  it.each(SENTINELS)("%s occurs under docs/", (sentinel) => {
    expect(docs.some((text) => text.includes(sentinel))).toBe(true);
  });
});
