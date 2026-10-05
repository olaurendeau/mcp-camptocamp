// Reads every outing matching a search, for outing_stats (S4 on #255): counts come from the listed outings,
// never from separate API queries, so every page must be read and must agree with the others.
import { searchOutings } from "../api/camptocamp.js";
import type { OutingListResponse } from "../api/camptocamp.js";
import { MAX_PARALLEL_REQUESTS, mapWithConcurrency } from "./concurrency.js";
import type { OutingFilters } from "./outings.js";

// The largest page Camptocamp serves, and the most pages one call reads: 2,000 outings at most (AC4.5).
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
export const MAX_COLLECTED_OUTINGS = PAGE_SIZE * MAX_PAGES;

const RESULTS_CHANGED = "Camptocamp's results changed while counting; call again.";

// An outing published, edited or deleted between two pages shifts the others: one is read twice, or missed.
// The `-id` tiebreak keeps outings ending the same day in one order, so only such a change can do it.
// A malformed item without an ID cannot be told apart from another: it counts once, as itself.
function assertComplete(documents: OutingListResponse["documents"], total: number): void {
  const ids = new Set<number>();
  let withoutId = 0;
  for (const document of documents) {
    if (document.document_id === undefined) withoutId++;
    else ids.add(document.document_id);
  }
  if (documents.length !== total || ids.size + withoutId !== total) throw new Error(RESULTS_CHANGED);
}

/**
 * Every outing matching `filters`, in the search's order (most recent first, ties by ID). Refuses a search
 * matching more than 2,000 outings after its first page, and fails if a page fails or the pages disagree.
 */
export async function collectMatchingOutings(filters: OutingFilters): Promise<OutingListResponse> {
  const read = (offset: number) => searchOutings({ ...filters, limit: PAGE_SIZE, offset, tiebreak_by_id: true });
  const first = await read(0);
  const { total } = first;
  if (total > MAX_COLLECTED_OUTINGS) {
    throw new Error(
      `${total.toLocaleString("en-US")} outings match these filters, more than the ` +
        `${MAX_COLLECTED_OUTINGS.toLocaleString("en-US")} that can be counted in one call: narrow the filters ` +
        "(dates, area, activity, routes…) and call again.",
    );
  }
  const offsets: number[] = [];
  for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) offsets.push(offset);
  const others = await mapWithConcurrency(offsets, MAX_PARALLEL_REQUESTS, async (offset) => {
    const page = await read(offset);
    if (page.total !== total) throw new Error(RESULTS_CHANGED);
    return page.documents;
  });
  const documents = [first.documents, ...others].flat();
  assertComplete(documents, total);
  return { total, documents };
}
