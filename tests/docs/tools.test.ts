// The tool reference (docs/tools/) against the tools the server registers: one page per tool, an index that
// links them all, Inputs blocks rendered from the current schema (AC18), and no invented tool or parameter (AC14).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { INPUTS_END, INPUTS_START, listRegisteredTools, renderToolPage } from "../../scripts/docs/inputs.js";
import { connect } from "../server/helpers.js";
import { ROOT, inlineCodeSpans, links, listMarkdownFiles } from "./markdown.js";

const DOCS = join(ROOT, "docs");
const TOOLS_DIR = join(DOCS, "tools");
const INDEX = join(TOOLS_DIR, "README.md");
const RUN = "run npm run docs:tools";

const tools = await listRegisteredTools();
const names = tools.map((tool) => tool.name);

function read(file: string): string {
  return readFileSync(file, "utf8");
}

function pageOf(name: string): string {
  return join(TOOLS_DIR, `${name}.md`);
}

/** The tools documented under docs/tools/: one `<tool>.md` per tool, next to the README.md index. */
function documentedTools(): string[] {
  return readdirSync(TOOLS_DIR)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .map((file) => file.slice(0, -".md".length))
    .sort();
}

/** Problems with the set of pages: a registered tool without a page, or a page for a tool that is not registered. */
function checkPages(pages: string[], registered: string[]): string[] {
  return [
    ...registered
      .filter((name) => !pages.includes(name))
      .map((name) => `docs/tools/${name}.md is missing for the registered tool ${name}: ${RUN}`),
    ...pages
      .filter((page) => !registered.includes(page))
      .map((page) => `docs/tools/${page}.md documents ${page}, which is not a registered tool`),
  ];
}

/** Problems with the index: it must link `<tool>.md` for exactly the registered tools. */
function checkIndex(text: string, registered: string[]): string[] {
  const linked = new Set(
    links(text).flatMap((target) => {
      const match = /^(?:\.\/)?([^/#?:]+)\.md(?:#.*)?$/.exec(target);
      return match && match[1] !== "README" ? [match[1]] : [];
    }),
  );
  return [
    ...registered.filter((name) => !linked.has(name)).map((name) => `the index does not link ${name}.md`),
    ...[...linked]
      .filter((name) => !registered.includes(name))
      .map((name) => `the index links ${name}.md, which is not a registered tool`),
  ];
}

/** Problems with a tool page: anything renderToolPage() would change, which is the Inputs block or the formatting. */
async function checkPage(tool: Tool, text: string, file: string): Promise<string[]> {
  const where = relative(ROOT, file);
  let rendered: string;
  try {
    rendered = await renderToolPage(tool, text, file);
  } catch (error) {
    return [`${where}: ${(error as Error).message}`];
  }
  return rendered === text
    ? []
    : [`${where}: the Inputs block differs from the registered schema of ${tool.name}: ${RUN}`];
}

const TOOL_LIKE = /^(?:search|get)_[a-z][a-z_]*$/;

/**
 * Names shaped like our tools that the docs mention on purpose and that are not MCP tools.
 * Each entry says where it comes from; add one only for a name that is not, and never was, one of our tools.
 */
const NOT_OUR_TOOLS = new Set([
  "get_location", // docs/agent-sdks.md: the local function of the upstream Mistral weather example, removed from ours
]);
const STRING = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;

/** The top-level keys of an object written as in the docs: `{query: "x", "lang": "de"}`, or shorthand `{user_id, lang}`. */
function argumentKeys(object: string): string[] {
  // A quoted key loses its quotes; any other string becomes "" so that its content is not read as keys.
  const blanked = object.replace(STRING, (string, offset: number) =>
    /^\s*:/.test(object.slice(offset + string.length)) ? string.slice(1, -1) : '""',
  );
  const keys: string[] = [];
  let depth = 0;
  let expectKey = false;
  for (const [token] of blanked.matchAll(/[{}[\],:]|[^\s{}[\],:]+/g)) {
    if (token === "{" || token === "[") {
      depth += 1;
      expectKey = token === "{" && depth === 1;
    } else if (token === "}" || token === "]") {
      depth -= 1;
      expectKey = false;
    } else if (token === ",") {
      expectKey = depth === 1;
    } else {
      if (expectKey && /^[A-Za-z_]\w*$/.test(token)) keys.push(token);
      expectKey = false;
    }
  }
  return keys;
}

/**
 * Problems with the tools and parameters `text` names (AC14):
 * - an inline `<tool> {key: …}` must name a registered tool and only its parameters;
 * - an inline `search_*` or `get_*` identifier must be a registered tool;
 * - a prefixed name, `camptocamp_<search|get>_…` (Mistral Vibe) or `mcp__camptocamp__<x>` (Claude Code), anywhere in
 *   the text, fenced blocks included, must name a registered tool. Other `camptocamp_` identifiers, such as the
 *   `camptocamp_agent` variable of an SDK example, are not tool names.
 * Names in NOT_OUR_TOOLS are skipped.
 */
function checkToolMentions(text: string, registered: Tool[]): string[] {
  const parameters = new Map(
    registered.map((tool) => [tool.name, new Set(Object.keys(tool.inputSchema.properties ?? {}))]),
  );
  const problems: string[] = [];
  for (const span of inlineCodeSpans(text)) {
    const call = /^([a-z][a-z0-9_]*)\s*(\{[\s\S]*\})$/.exec(span);
    if (call && !NOT_OUR_TOOLS.has(call[1]) && (parameters.has(call[1]) || TOOL_LIKE.test(call[1]))) {
      const known = parameters.get(call[1]);
      if (known === undefined) {
        problems.push(`\`${span}\`: ${call[1]} is not a registered tool`);
      } else {
        for (const key of argumentKeys(call[2]).filter((key) => !known.has(key))) {
          problems.push(`\`${span}\`: ${call[1]} has no parameter ${key}`);
        }
      }
    }
    for (const [name] of span.matchAll(/(?<![\w./-])(?:search|get)_[a-z][a-z_]*/g)) {
      if (!parameters.has(name) && !NOT_OUR_TOOLS.has(name)) {
        problems.push(`\`${span}\`: ${name} is not a registered tool`);
      }
    }
  }
  // Claude Code's mcp__camptocamp__ prefix is ours alone; Vibe's camptocamp_ prefix is only read before a tool name.
  for (const prefixed of [
    /(?<![\w-])mcp__camptocamp__([a-z][a-z_]*)/g,
    /(?<![\w-])camptocamp_((?:search|get)_[a-z_]*)/g,
  ]) {
    for (const [mention, name] of text.matchAll(prefixed)) {
      if (!parameters.has(name)) problems.push(`${mention}: ${name} is not a registered tool`);
    }
  }
  return [...new Set(problems)];
}

describe("the registered tools", () => {
  it("listRegisteredTools() returns what an MCP client lists", async () => {
    const client = await connect();

    expect(tools).toEqual((await client.listTools()).tools);
    expect(names).toHaveLength(13);
  });
});

describe("tool reference checks fail on bad fixtures", () => {
  it("a deleted page", () => {
    expect(
      checkPages(
        names.filter((name) => name !== "search_routes"),
        names,
      ),
    ).toEqual([`docs/tools/search_routes.md is missing for the registered tool search_routes: ${RUN}`]);
  });

  it("a page for a tool that is not registered", () => {
    expect(checkPages([...names, "search_huts"], names)).toEqual([
      "docs/tools/search_huts.md documents search_huts, which is not a registered tool",
    ]);
  });

  it("a tool missing from the index, or an index entry for an unknown tool", () => {
    const index = [
      "| Tool | What it does |",
      "| --- | --- |",
      ...names.map((name) => `| [\`${name}\`](${name}.md) | Does things. |`),
      "",
      "See also [the docs index](../README.md) and [inputs](#keeping-the-pages-in-sync).",
    ].join("\n");
    const withoutRoutes = index.replace(/^.*\(search_routes\.md\).*\n/m, "");

    expect(checkIndex(index, names)).toEqual([]);
    expect(checkIndex(withoutRoutes, names)).toEqual(["the index does not link search_routes.md"]);
    expect(checkIndex(`${index}\n- [search_huts](search_huts.md)\n`, names)).toEqual([
      "the index links search_huts.md, which is not a registered tool",
    ]);
  });

  it("one character edited inside an Inputs block", async () => {
    const file = pageOf("search_routes");
    const page = read(file);
    const start = page.indexOf(INPUTS_START);
    const limit = page.indexOf("`limit`", start);
    const edited = `${page.slice(0, limit + 1)}L${page.slice(limit + 2)}`;
    const tool = tools.find((t) => t.name === "search_routes") as Tool;

    expect(limit).toBeGreaterThan(start);
    expect(limit).toBeLessThan(page.indexOf(INPUTS_END));
    expect(await checkPage(tool, edited, file)).toEqual([
      `docs/tools/search_routes.md: the Inputs block differs from the registered schema of search_routes: ${RUN}`,
    ]);
  });

  it("a schema changed without running npm run docs:tools (AC18)", async () => {
    const file = pageOf("search_routes");
    const tool = tools.find((t) => t.name === "search_routes") as Tool;
    const limit = { ...tool.inputSchema.properties?.limit, maximum: 100 };
    const changed: Tool = {
      ...tool,
      inputSchema: { ...tool.inputSchema, properties: { ...tool.inputSchema.properties, limit } },
    };

    expect(await checkPage(changed, read(file), file)).toEqual([
      `docs/tools/search_routes.md: the Inputs block differs from the registered schema of search_routes: ${RUN}`,
    ]);
  });

  it("a page without its Inputs markers", async () => {
    const file = pageOf("search_routes");
    const tool = tools.find((t) => t.name === "search_routes") as Tool;

    expect(await checkPage(tool, "# search_routes\n", file)).toEqual([
      `docs/tools/search_routes.md: ${file}: missing marker ${INPUTS_START}`,
    ]);
  });

  it("a call with a parameter the tool does not have, or a tool that does not exist", () => {
    expect(checkToolMentions("Try `search_routes {foo: 1}`.", tools)).toEqual([
      "`search_routes {foo: 1}`: search_routes has no parameter foo",
    ]);
    expect(checkToolMentions('Try `search_huts {query: "x"}`.', tools)).toEqual([
      '`search_huts {query: "x"}`: search_huts is not a registered tool',
    ]);
    expect(checkToolMentions('`get_outing {"id": 1, "user": 2}`', tools)).toEqual([
      '`get_outing {"id": 1, "user": 2}`: get_outing has no parameter user',
    ]);
    expect(checkToolMentions("`search_outings {route_id, date}`", tools)).toEqual([
      "`search_outings {route_id, date}`: search_outings has no parameter date",
    ]);
  });

  it("an unknown search_* or get_* identifier, or an unknown prefixed tool name", () => {
    const text = [
      "Call `get_routes`, then `More: search_hut with waypoint_id=<id>`.",
      "Allow `mcp__camptocamp__get_summit` and:",
      "```toml",
      "[tools.camptocamp_search_huts]",
      "```",
    ].join("\n");

    expect(checkToolMentions(text, tools)).toEqual([
      "`get_routes`: get_routes is not a registered tool",
      "`More: search_hut with waypoint_id=<id>`: search_hut is not a registered tool",
      "mcp__camptocamp__get_summit: get_summit is not a registered tool",
      "camptocamp_search_huts: search_huts is not a registered tool",
    ]);
  });

  it("accepts registered tools and their parameters, in any of the documented forms", () => {
    const text = [
      'Run `search_outings {area_id: 14409, activity: "skitouring", period_start: "06-01", period_end: "06-30"}`,',
      '`search_routes {query: "a: b, c", lang: "de"}`, `search_outings {route_id}`, `get_route {"id": 675555}`',
      "and `search_waypoints {query: …}`, then `get_*`, `More: search_routes with waypoint_id=<id>`.",
      "`mcp__camptocamp__search_routes`, `mcp__camptocamp__*`, `camptocamp_get_route`, `camptocamp`.",
    ].join("\n");

    expect(checkToolMentions(text, tools)).toEqual([]);
  });

  it("accepts a camptocamp_ identifier that is not shaped like a tool, such as an SDK example's variable", () => {
    const text = [
      "```python",
      "camptocamp_agent = client.beta.agents.create(",
      ")",
      "run = client.beta.conversations.start(agent_id=camptocamp_agent.id)",
      "```",
      "Keep `camptocamp_agent` and `camptocamp_server` around.",
    ].join("\n");

    expect(checkToolMentions(text, tools)).toEqual([]);
  });

  it("accepts a name of the explicit allow-list, such as the upstream example's get_location function", () => {
    expect(checkToolMentions("The source also registers a local `get_location` function.", tools)).toEqual([]);
    expect(checkToolMentions("`get_location {city: 1}`", tools)).toEqual([]);
    expect(checkToolMentions("`get_locations`", tools)).toEqual([
      "`get_locations`: get_locations is not a registered tool",
    ]);
  });
});

describe("docs/tools/", () => {
  it("has a page for each registered tool and for no other", () => {
    expect(checkPages(documentedTools(), names)).toEqual([]);
  });

  it("has an index that links exactly the registered tools", () => {
    expect(existsSync(INDEX)).toBe(true);
    expect(checkIndex(read(INDEX), names)).toEqual([]);
  });

  it("is linked from the docs index", () => {
    expect(links(read(join(DOCS, "README.md")))).toContain("tools/README.md");
  });

  it.each(names)("%s.md has the Inputs block the registered schema renders now", async (name) => {
    const file = pageOf(name);
    const tool = tools.find((t) => t.name === name) as Tool;

    expect(existsSync(file), `${relative(ROOT, file)} is missing: ${RUN}`).toBe(true);
    expect(await checkPage(tool, read(file), file)).toEqual([]);
  });

  it.each(names)("%s.md has the Purpose, Inputs and Related tools sections, in that order", (name) => {
    const headings = read(pageOf(name))
      .split("\n")
      .filter((line) => line.startsWith("#"));

    expect(headings[0]).toBe(`# ${name}`);
    const sections = headings.filter((line) => line.startsWith("## "));
    expect(sections.indexOf("## Purpose")).toBe(0);
    expect(sections.indexOf("## Inputs")).toBe(1);
    expect(sections.at(-1)).toBe("## Related tools");
  });
});

describe("docs/ and README.md", () => {
  it("name only registered tools, and only their parameters (AC14)", () => {
    const files = [...listMarkdownFiles(DOCS), join(ROOT, "README.md")];
    const problems = files.flatMap((file) =>
      checkToolMentions(read(file), tools).map((problem) => `${relative(ROOT, file)}: ${problem}`),
    );

    expect(problems).toEqual([]);
  });
});
