import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

/** The checkout these tests belong to (a developer worktree reads its own files, not the main checkout's). */
export const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Every `.md` file under `dir`, recursively, as absolute paths in sorted order. */
export function listMarkdownFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".md"))
    .map((path) => join(dir, path))
    .sort();
}

export interface FencedBlock {
  /** First word of the info string (`json` for ```json), or "" without one. */
  lang: string;
  content: string;
  /** 1-based line number of the block's first content line. */
  line: number;
}

const FENCE_OPEN = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/;

/** Splits `text` into lines, each marked with the fenced block it belongs to (fences included), if any. */
function scanFences(text: string): { line: string; block: FencedBlock | undefined }[] {
  const scanned: { line: string; block: FencedBlock | undefined }[] = [];
  let open: { marker: string; block: FencedBlock; lines: string[] } | undefined;

  for (const [index, line] of text.split("\n").entries()) {
    if (open === undefined) {
      const match = FENCE_OPEN.exec(line);
      if (match) {
        open = { marker: match[1], block: { lang: match[2], content: "", line: index + 2 }, lines: [] };
        scanned.push({ line, block: open.block });
      } else {
        scanned.push({ line, block: undefined });
      }
      continue;
    }
    const closing = new RegExp(`^\\s*${open.marker[0]}{${open.marker.length},}\\s*$`);
    if (closing.test(line)) {
      open.block.content = open.lines.join("\n");
      scanned.push({ line, block: open.block });
      open = undefined;
    } else {
      open.lines.push(line);
      scanned.push({ line, block: open.block });
    }
  }
  if (open !== undefined) {
    open.block.content = open.lines.join("\n");
  }
  return scanned;
}

/** The fenced code blocks of `text`, optionally only those of language `lang`. */
export function fencedBlocks(text: string, lang?: string): FencedBlock[] {
  const blocks = new Set(scanFences(text).flatMap(({ block }) => (block ? [block] : [])));
  return [...blocks].filter((block) => lang === undefined || block.lang === lang);
}

/** `text` with every fenced block blanked out (line numbers are kept). */
function withoutFences(text: string): string {
  return scanFences(text)
    .map(({ line, block }) => (block ? "" : line))
    .join("\n");
}

const INLINE_CODE = /(`+)([\s\S]*?[^`])\1(?!`)/g;

/** The inline code spans of `text`, outside fenced blocks, trimmed of one padding space like CommonMark. */
export function inlineCodeSpans(text: string): string[] {
  return [...withoutFences(text).matchAll(INLINE_CODE)].map(([, , code]) =>
    / \S|\S /.test(code) && code.startsWith(" ") && code.endsWith(" ") ? code.slice(1, -1) : code,
  );
}

/** `text` without fenced blocks, inline code spans and HTML comments: what Markdown renders as prose. */
function prose(text: string): string {
  return withoutFences(text)
    .replace(INLINE_CODE, (span) => " ".repeat(span.length))
    .replace(/<!--[\s\S]*?-->/g, "");
}

const INLINE_LINK = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/gm;

/** Targets of the inline links, images and reference definitions of `text`, outside code and comments. */
export function links(text: string): string[] {
  const rendered = prose(text);
  return [...rendered.matchAll(INLINE_LINK), ...rendered.matchAll(REFERENCE_DEFINITION)].map(([, target]) =>
    target.startsWith("<") ? target.slice(1, -1) : target,
  );
}

/** The anchor GitHub gives a heading: inline Markdown rendered, lowercased, punctuation dropped, spaces to hyphens. */
export function slugify(heading: string): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** The anchors of the ATX headings of `text`, outside fenced blocks; a repeated anchor gets -1, -2… like GitHub. */
export function headingSlugs(text: string): string[] {
  const seen = new Map<string, number>();
  return scanFences(text)
    .filter(({ block }) => block === undefined)
    .flatMap(({ line }) => {
      const match = /^ {0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
      if (!match) {
        return [];
      }
      const slug = slugify(match[1]);
      const count = seen.get(slug) ?? 0;
      seen.set(slug, count + 1);
      return [count === 0 ? slug : `${slug}-${count}`];
    });
}

/** Problems with the relative links of `file` (whose content is `text`): missing files or anchors, paths out of the repo. */
export function checkLinks(file: string, text: string): string[] {
  return links(text).flatMap((target) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
      return [];
    }
    if (target.startsWith("/")) {
      return [`${target}: use a relative link, not a path from the site root`];
    }
    const hash = target.indexOf("#");
    const path = decodeURIComponent(hash === -1 ? target : target.slice(0, hash));
    const anchor = hash === -1 ? undefined : decodeURIComponent(target.slice(hash + 1));
    const resolved = path === "" ? file : resolve(dirname(file), path);
    const fromRoot = relative(ROOT, resolved);
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
      return [`${target}: points outside the repository`];
    }
    if (path !== "" && !existsSync(resolved)) {
      return [`${target}: no such file`];
    }
    if (anchor === undefined || !resolved.endsWith(".md") || (path !== "" && !statSync(resolved).isFile())) {
      return [];
    }
    const headings = headingSlugs(resolved === file ? text : readFileSync(resolved, "utf8"));
    return headings.includes(anchor) ? [] : [`${target}: no heading with this anchor`];
  });
}

/** Problems with the ```json blocks of `text` that do not parse. */
export function checkJsonBlocks(text: string): string[] {
  return fencedBlocks(text, "json").flatMap((block) => {
    try {
      JSON.parse(block.content);
      return [];
    } catch (error) {
      return [`json block at line ${block.line}: ${(error as Error).message}`];
    }
  });
}

const NPX_ARGS = ["-y", "@olaurendeau/mcp-camptocamp"];
const DOCKER_ARGS = ["run", "--rm", "-i", "ghcr.io/olaurendeau/mcp-camptocamp:latest"];

/** Every value of a `mcpServers` key in `value`, at any depth. */
function mcpServersIn(value: unknown): unknown[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const entries: [string, unknown][] = Object.entries(value);
  return entries.flatMap(([key, child]) => [...(key === "mcpServers" ? [child] : []), ...mcpServersIn(child)]);
}

/** Problems with the `mcpServers` objects of the json blocks of `text`: another server name, another command. */
export function checkMcpServers(text: string): string[] {
  return fencedBlocks(text, "json").flatMap((block) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block.content);
    } catch {
      return []; // reported by checkJsonBlocks
    }
    return mcpServersIn(parsed).flatMap((servers) => {
      const where = `mcpServers at line ${block.line}`;
      const names = typeof servers === "object" && servers !== null ? Object.keys(servers) : [];
      if (names.length !== 1 || names[0] !== "camptocamp") {
        return [`${where}: expected the single key "camptocamp", got ${names.map((name) => `"${name}"`).join(", ")}`];
      }
      const { command, args } = (servers as { camptocamp: { command?: unknown; args?: unknown } }).camptocamp;
      const npx = command === "npx" && isDeepStrictEqual(args, NPX_ARGS);
      const docker = command === "docker" && isDeepStrictEqual(args, DOCKER_ARGS);
      return npx || docker
        ? []
        : [`${where}: camptocamp must run npx ${NPX_ARGS.join(" ")} or docker ${DOCKER_ARGS.join(" ")}`];
    });
  });
}

const ALLOWED_NAMES = new Set([
  "@olaurendeau/mcp-camptocamp", // npm package
  "ghcr.io/olaurendeau/mcp-camptocamp:latest", // Docker image
  "io.github.olaurendeau/mcp-camptocamp", // MCP registry name
  "mcp-camptocamp", // serverInfo name and npm bin
]);
const ALLOWED_URLS = [
  /^https:\/\/github\.com\/olaurendeau\/mcp-camptocamp(?:[/?#]\S*)?$/,
  /^https:\/\/www\.npmjs\.com\/package\/@olaurendeau\/mcp-camptocamp$/,
];

/** Problems with the tokens of `text` that contain `mcp-camptocamp` but are not one of its allowed names or URLs. */
export function checkNames(text: string): string[] {
  return [...text.matchAll(/[^\s"'`()<>[\]{},;|*]*mcp-camptocamp[^\s"'`()<>[\]{},;|*]*/g)]
    .map(([token]) => token.replace(/[.:!?]+$/, ""))
    .filter((token) => !ALLOWED_NAMES.has(token) && !ALLOWED_URLS.some((url) => url.test(token)))
    .map((token) => `unexpected name "${token}"`);
}

/** Problems with the `Node NN` / `Node.js NN` mentions of `text` whose major version is not the `>=NN` of `engines`. */
export function checkNodeVersion(text: string, engines: string): string[] {
  const minimum = /^>=(\d+)$/.exec(engines);
  if (!minimum) {
    throw new Error(`Unsupported engines.node "${engines}"`);
  }
  return [...text.matchAll(/\bNode(?:\.js)? v?(\d+)/gi)]
    .filter(([, major]) => major !== minimum[1])
    .map(([mention]) => `${mention}: engines.node in package.json is "${engines}"`);
}

/** Problems with the `## Sources` section and the `Last verified` line a client or SDK page ends with. */
export function checkSources(text: string): string[] {
  const problems: string[] = [];
  const sources = /^## Sources\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!sources) {
    problems.push('no "## Sources" section');
  } else if (!/https:\/\/\S+/.test(sources[1])) {
    problems.push("the Sources section has no https URL");
  }
  if (!/^Last verified: \d{4}-\d{2}-\d{2} against official docs$/m.test(text)) {
    problems.push('no line "Last verified: YYYY-MM-DD against official docs"');
  }
  return problems;
}
