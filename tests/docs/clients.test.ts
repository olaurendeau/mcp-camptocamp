import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { connect } from "../server/helpers.js";
import { ROOT, fencedBlocks } from "./markdown.js";

const CLIENTS = join(ROOT, "docs", "clients");
const VIBE = join(CLIENTS, "mistral-vibe-code.md");
const GEMINI = join(CLIENTS, "gemini-cli.md");

/** A TOML table header (`[a.b]` or `[[a]]`) with the `key = value` lines under it, values kept as written. */
interface TomlTable {
  header: string;
  entries: Partial<Record<string, string>>;
}

/**
 * The tables of the ```toml blocks of `text`, read line by line: enough for the flat snippets of the client
 * pages (headers, `key = value` lines, comments), not a TOML parser. Keys before any header go under "".
 */
function tomlTables(text: string): TomlTable[] {
  const tables: TomlTable[] = [];
  for (const block of fencedBlocks(text, "toml")) {
    let current: TomlTable = { header: "", entries: {} };
    tables.push(current);
    for (const line of block.content.split("\n").map((raw) => raw.trim())) {
      const header = /^(\[\[?[^\]]+\]\]?)$/.exec(line);
      const entry = /^([\w.-]+)\s*=\s*(.+)$/.exec(line);
      if (header) {
        current = { header: header[1], entries: {} };
        tables.push(current);
      } else if (entry) {
        current.entries[entry[1]] = entry[2];
      }
    }
  }
  return tables.filter((table) => table.header !== "" || Object.keys(table.entries).length > 0);
}

/** Problems with the Vibe permission tables of `text`: one `[tools.camptocamp_<tool>]` with `permission = "always"` per tool. */
function checkVibePermissions(text: string, tools: string[]): string[] {
  const tables = tomlTables(text).filter((table) => /^\[tools\.camptocamp_/.test(table.header));
  const named = tables.map((table) => /^\[tools\.camptocamp_(.+)\]$/.exec(table.header)?.[1] ?? table.header);
  const problems: string[] = [];
  for (const tool of tools) {
    const count = named.filter((name) => name === tool).length;
    if (count !== 1) {
      problems.push(`[tools.camptocamp_${tool}]: expected 1 table, got ${count}`);
    }
  }
  for (const name of new Set(named)) {
    if (!tools.includes(name)) {
      problems.push(`[tools.camptocamp_${name}]: not a registered tool`);
    }
  }
  for (const table of tables) {
    if (table.entries.permission !== '"always"') {
      problems.push(`${table.header}: expected permission = "always", got ${table.entries.permission ?? "none"}`);
    }
  }
  return problems;
}

const NPX = { command: '"npx"', args: '["-y", "@olaurendeau/mcp-camptocamp"]' };
const DOCKER = { command: '"docker"', args: '["run", "--rm", "-i", "ghcr.io/olaurendeau/mcp-camptocamp:latest"]' };

/** Problems with the `[[mcp_servers]]` entries of `text`: name camptocamp, stdio, and the npx or Docker command. */
function checkVibeServers(text: string): string[] {
  return tomlTables(text)
    .filter((table) => table.header === "[[mcp_servers]]")
    .flatMap((table, n) => {
      const { name, transport, command, args } = table.entries;
      const launch = [NPX, DOCKER].some((variant) => variant.command === command && variant.args === args);
      return name === '"camptocamp"' && transport === '"stdio"' && launch
        ? []
        : [`[[mcp_servers]] #${n + 1}: expected name "camptocamp", transport "stdio" and the npx or Docker command`];
    });
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

async function registeredTools(): Promise<string[]> {
  const client = await connect();
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((tool) => tool.name);
}

const fence = "```";

describe("client page checks fail on bad fixtures", () => {
  const tools = ["search_routes", "get_route"];

  it("reads the tables and keys of toml blocks only", () => {
    const text = [
      "[tools.camptocamp_outside] is prose",
      fence + "toml",
      "# comment",
      "top = 1",
      "[[mcp_servers]]",
      'name = "camptocamp"',
      "",
      "[tools.camptocamp_search_routes]",
      'permission = "always"',
      fence,
    ].join("\n");

    expect(tomlTables(text)).toEqual([
      { header: "", entries: { top: "1" } },
      { header: "[[mcp_servers]]", entries: { name: '"camptocamp"' } },
      { header: "[tools.camptocamp_search_routes]", entries: { permission: '"always"' } },
    ]);
  });

  it("a missing tool, a duplicated tool, an unknown tool and a permission other than always", () => {
    const text = [
      fence + "toml",
      "[tools.camptocamp_search_routes]",
      'permission = "always"',
      "[tools.camptocamp_search_routes]",
      'permission = "ask"',
      "[tools.camptocamp_search_everything]",
      'permission = "always"',
      fence,
    ].join("\n");

    expect(checkVibePermissions(text, tools)).toEqual([
      "[tools.camptocamp_search_routes]: expected 1 table, got 2",
      "[tools.camptocamp_get_route]: expected 1 table, got 0",
      "[tools.camptocamp_search_everything]: not a registered tool",
      '[tools.camptocamp_search_routes]: expected permission = "always", got "ask"',
    ]);
  });

  it("accepts one always table per tool", () => {
    const text = [
      fence + "toml",
      ...tools.flatMap((tool) => [`[tools.camptocamp_${tool}]`, 'permission = "always"']),
      fence,
    ];

    expect(checkVibePermissions(text.join("\n"), tools)).toEqual([]);
  });

  it("an mcp_servers entry with another name, transport or command", () => {
    const text = [
      fence + "toml",
      "[[mcp_servers]]",
      'name = "camptocamp_server"',
      'transport = "stdio"',
      `command = ${NPX.command}`,
      `args = ${NPX.args}`,
      "[[mcp_servers]]",
      'name = "camptocamp"',
      'transport = "stdio"',
      'command = "npx"',
      'args = ["@olaurendeau/mcp-camptocamp"]',
      "[[mcp_servers]]",
      'name = "camptocamp"',
      'transport = "stdio"',
      `command = ${DOCKER.command}`,
      `args = ${DOCKER.args}`,
      fence,
    ].join("\n");

    expect(checkVibeServers(text)).toEqual([
      '[[mcp_servers]] #1: expected name "camptocamp", transport "stdio" and the npx or Docker command',
      '[[mcp_servers]] #2: expected name "camptocamp", transport "stdio" and the npx or Docker command',
    ]);
  });
});

describe("Mistral Vibe Code page", () => {
  it("exists", () => {
    expect(existsSync(VIBE)).toBe(true);
  });

  it("allows each registered tool once with permission = always, and no other tool", async () => {
    const tools = await registeredTools();

    expect(tools).toHaveLength(14);
    expect(checkVibePermissions(read(VIBE), tools)).toEqual([]);
  });

  it("declares the server as a camptocamp stdio entry, with the npx and Docker variants", () => {
    const text = read(VIBE);
    const servers = tomlTables(text).filter((table) => table.header === "[[mcp_servers]]");

    expect(checkVibeServers(text)).toEqual([]);
    expect(servers.map((table) => table.entries.command).sort()).toEqual([DOCKER.command, NPX.command]);
  });
});

describe("Gemini CLI page", () => {
  it("exists", () => {
    expect(existsSync(GEMINI)).toBe(true);
  });

  it("has a policy rule for the camptocamp server and a toolAnnotations rule", () => {
    const rules = tomlTables(read(GEMINI)).filter((table) => table.header === "[[rule]]");

    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.entries).toMatchObject({ mcpName: '"camptocamp"', decision: '"allow"' });
    }
    expect(rules.some((rule) => rule.entries.toolAnnotations === "{ readOnlyHint = true }")).toBe(true);
  });
});
