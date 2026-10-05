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

/** `source` without its `//` and `/* *\/` comments: strings are matched first, so the markers inside them stay. */
function stripJsonComments(source: string): string {
  return source.replace(
    /("(?:[^"\\\n]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/g,
    (_match, string?: string) => string ?? " ",
  );
}

/** A json or jsonc block with its parsed `value`, or the parse `error`. */
export interface JsonBlock extends FencedBlock {
  value?: unknown;
  error?: string;
}

/** The ```json and ```jsonc blocks of `text` (any case), parsed; a jsonc block loses its comments first. */
export function jsonBlocks(text: string): JsonBlock[] {
  return fencedBlocks(text)
    .filter((block) => /^jsonc?$/i.test(block.lang))
    .map((block) => {
      const source = block.lang.toLowerCase() === "jsonc" ? stripJsonComments(block.content) : block.content;
      try {
        return { ...block, value: JSON.parse(source) as unknown };
      } catch (error) {
        return { ...block, error: (error as Error).message };
      }
    });
}

/** Problems with the json and jsonc blocks of `text` that do not parse. */
export function checkJsonBlocks(text: string): string[] {
  return jsonBlocks(text).flatMap((block) =>
    block.error === undefined ? [] : [`json block at line ${block.line}: ${block.error}`],
  );
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

/** Problems with the `mcpServers` objects of the json and jsonc blocks of `text`: another server name, another command. */
export function checkMcpServers(text: string): string[] {
  // Blocks that do not parse have no value: checkJsonBlocks reports them.
  return jsonBlocks(text).flatMap((block) =>
    mcpServersIn(block.value).flatMap((servers) => {
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
    }),
  );
}

const ALLOWED_NAMES = new Set([
  "@olaurendeau/mcp-camptocamp", // npm package
  "ghcr.io/olaurendeau/mcp-camptocamp:latest", // Docker image
  "mcp-camptocamp-mcp", // local image built by docker compose build mcp
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

// A version mention (Node 22, Node >= 22, node@22, [Node.js](url) 22, Node.js versions 18 and 20…), maybe after "older ".
const NODE_VERSION =
  /\b(older\s+)?node(?:\.js)?(?:\]\([^)]*\))?(?:\s+versions?)?(?:\s*>=?\s*|\s+v?|@|:)(\d+(?:\s*(?:,|and|or)\s*\d+)*)/gi;
/** The one phrase allowed to name versions other than the minimum, all below it: a statement about unsupported ones. */
const OLDER_VERSIONS = "older Node.js versions ";

/** Problems with the Node.js version mentions of `text` that name a major version other than the `>=NN` of `engines`. */
export function checkNodeVersion(text: string, engines: string): string[] {
  const minimumMatch = /^>=(\d+)$/.exec(engines);
  if (!minimumMatch) {
    throw new Error(`Unsupported engines.node "${engines}"`);
  }
  const minimum = Number(minimumMatch[1]);
  return [...text.matchAll(NODE_VERSION)].flatMap(([mention, , list]) => {
    const majors = list.split(/\s*(?:,|and|or)\s*/i).map(Number);
    if (mention.startsWith(OLDER_VERSIONS)) {
      return majors.every((major) => major < minimum)
        ? []
        : [`${mention}: "${OLDER_VERSIONS.trim()}" must name versions below ${minimum}`];
    }
    return majors.every((major) => major === minimum)
      ? []
      : [`${mention.replace(/^older\s+/i, "")}: engines.node in package.json is "${engines}"`];
  });
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

/** The content of the file at `path`, or undefined if it is missing or not a file. */
function readExistingFile(path: string): string | undefined {
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : undefined;
}

const LAST_VERIFIED = /^Last verified: (\d{4}-\d{2}-\d{2}) against official docs$/m;
const MATRIX_COLUMNS = ["Client", "Works?", "Page", "Last verified"];

/** The body of the `## <title>` section of `text`, up to the next `## ` heading, or undefined without one. */
export function section(text: string, title: string): string | undefined {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(text)?.[1];
}

/**
 * Problems with the `## Support matrix` of the docs index `file` (content `text`): its columns, a page link and
 * the page's own `Last verified` date in each row, and a row for each of `pages`. `readPage` returns a page's
 * content, or undefined when it is missing; an anchor-only link (`#…`) points at `file` itself, as in `checkLinks`.
 */
export function checkSupportMatrix(
  file: string,
  text: string,
  pages: string[],
  readPage: (path: string) => string | undefined = readExistingFile,
): string[] {
  const body = section(text, "Support matrix");
  if (body === undefined) {
    return ['no "## Support matrix" section'];
  }
  const table = body
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
  const header = table.length === 0 ? "no table" : table[0].join(", ");
  if (header !== MATRIX_COLUMNS.join(", ")) {
    return [`expected the columns ${MATRIX_COLUMNS.join(", ")}, got ${header}`];
  }
  const rows = table.slice(2);
  const linked = new Set<string>();
  const problems = rows.flatMap((cells) => {
    const [client, , page, date] = cells;
    if (cells.length !== MATRIX_COLUMNS.length) {
      return [`row "${client}": expected ${MATRIX_COLUMNS.length} cells, got ${cells.length}`];
    }
    const target = links(page).find((link) => !/^[a-z][a-z0-9+.-]*:/i.test(link));
    if (target === undefined) {
      return [`row "${client}": no link to a page`];
    }
    const path = decodeURIComponent(target.replace(/#.*/, ""));
    const resolved = path === "" ? file : resolve(dirname(file), path);
    linked.add(resolved);
    const content = resolved === file ? text : readPage(resolved);
    const verified = content === undefined ? undefined : LAST_VERIFIED.exec(content)?.[1];
    return verified === date
      ? []
      : [`row "${client}": Last verified ${date}, but ${relative(ROOT, resolved)} says ${verified ?? "nothing"}`];
  });
  return [
    ...problems,
    ...pages.filter((page) => !linked.has(page)).map((page) => `${relative(ROOT, page)}: no row links this page`),
  ];
}
