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
  /** Lines printed after the filters, before the results. */
  notes?: string[];
  /** Appended to the total, e.g. ", most recent first". */
  order?: string;
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
    return filterText ? `No ${kind}s found matching ${filterText}.` : `No ${kind}s found.`;
  }

  const output = [`Found ${total} ${kind}(s)${order}. Showing ${lines.length} from offset ${offset}:`];
  if (filterText) output.push(`Filters: ${filterText}`);
  output.push(...notes);
  if (lines.length === 0) return output.join("\n");

  output.push("", ...lines);
  const next = offset + lines.length;
  if (next < total) {
    output.push(
      "",
      next + limit <= MAX_RESULT_WINDOW
        ? `Next page: offset=${next}`
        : "More results exist beyond Camptocamp's 10,000-result window; narrow the filters.",
    );
  }
  return output.join("\n");
}
