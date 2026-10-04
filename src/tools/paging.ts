/** Camptocamp refuses any search where offset + limit goes past this many results. */
export const MAX_RESULT_WINDOW = 10000;

/** Refuses, before any request, a page that Camptocamp would answer with a 400. */
export function assertResultWindow(offset: number, limit: number): void {
  if (offset + limit > MAX_RESULT_WINDOW) {
    throw new Error(
      `offset + limit must not exceed ${MAX_RESULT_WINDOW}: Camptocamp only returns the first 10,000 results of a search. Narrow the filters instead.`,
    );
  }
}

const ESCAPES: Record<string, string> = { '"': '\\"', "\\": "\\\\", "\n": "\\n", "\r": "\\r", "\t": "\\t" };

/** True for a character `quote()` escapes as `\uxxxx`; all of them are in the BMP. */
function isEscapedAsCode(code: number): boolean {
  return (
    code <= 0x1f || // C0 controls
    (code >= 0x7f && code <= 0x9f) || // DEL and C1 controls
    code === 0x061c || // Arabic letter mark
    (code >= 0x200b && code <= 0x200f) || // zero-width space, non-joiner, joiner; LRM, RLM
    code === 0x2028 || // line separator
    code === 0x2029 || // paragraph separator
    (code >= 0x202a && code <= 0x202e) || // bidi embeddings and overrides
    (code >= 0x2066 && code <= 0x2069) || // bidi isolates
    code === 0xfeff // zero-width no-break space (BOM)
  );
}

/**
 * Wraps user input echoed in an output line in double quotes, on one line, so it cannot fake a
 * line of its own (e.g. a `Next page:` footer) nor hide or reorder part of itself for a human
 * reader: `"`, `\`, LF, CR and tab escape as in JSON; other C0 and C1 controls, DEL, U+2028,
 * U+2029, and the bidi and zero-width characters U+061C, U+200B–U+200F, U+202A–U+202E,
 * U+2066–U+2069 and U+FEFF as lowercase `\uxxxx` (a ZWJ inside an emoji sequence too); every other
 * character is unchanged.
 */
export function quote(value: string): string {
  let escaped = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    escaped += ESCAPES[char] ?? (isEscapedAsCode(code) ? `\\u${code.toString(16).padStart(4, "0")}` : char);
  }
  return `"${escaped}"`;
}

export interface SearchPage {
  /** Singular document kind, e.g. "outing". */
  kind: string;
  /** Total number of matches reported by Camptocamp. */
  total: number;
  offset: number;
  limit: number;
  /** One formatted line per returned document. */
  lines: string[];
  /** Applied filters, e.g. `query "x"`, `area 14409`; printed in the given order. */
  filters?: string[];
  /** Lines printed after the filters, before the results; also after the nothing-found line. */
  notes?: string[];
  /** Appended to the total, e.g. ", most recent first". */
  order?: string;
}

/** Footer pointing to the next page, with a smaller limit when a full page would pass the window. */
function formatNextPage(next: number, limit: number): string {
  if (next >= MAX_RESULT_WINDOW) {
    return "More results exist beyond Camptocamp's 10,000-result window; narrow the filters.";
  }
  const room = MAX_RESULT_WINDOW - next;
  return room < limit ? `Next page: offset=${next} (limit at most ${room})` : `Next page: offset=${next}`;
}

/** R6: shared header, filters and next-page footer of every search tool. */
export function formatSearchPage({
  kind,
  total,
  offset,
  limit,
  lines,
  filters = [],
  notes = [],
  order = "",
}: SearchPage): string {
  const filterText = filters.join(", ");
  if (total === 0) {
    const empty = filterText ? `No ${kind}s found matching ${filterText}.` : `No ${kind}s found.`;
    return [empty, ...notes].join("\n");
  }

  const output = [`Found ${total} ${kind}(s)${order}. Showing ${lines.length} from offset ${offset}:`];
  if (filterText) output.push(`Filters: ${filterText}`);
  output.push(...notes);
  if (lines.length === 0) return output.join("\n");

  output.push("", ...lines);
  const next = offset + lines.length;
  if (next < total) {
    output.push("", formatNextPage(next, limit));
  }
  return output.join("\n");
}

/** Tool-description sentence explaining `offset` and the footer of a paged search. */
export const PAGING_NOTE =
  "Use offset to page (offset + limit ≤ 10,000): the output ends with 'Next page: offset=N' when more results follow — or 'Next page: offset=N (limit at most M)' near the window's end, where limit must be lowered to M — or says when they lie beyond Camptocamp's 10,000-result window.";
