// outing_stats (S4 on #255): counts the outings matching a search by start month, start year or condition. Counts
// come from the listed outings, never from separate API queries, so every page must be read and must agree with
// the others.
import { z } from "zod";
import { searchOutings } from "../api/camptocamp.js";
import type { OutingListResponse } from "../api/camptocamp.js";
import { isMalformed } from "../api/schemas.js";
import { CONDITION_RATINGS } from "../api/values.js";
import { MAX_PARALLEL_REQUESTS, mapWithConcurrency } from "./concurrency.js";
import { enumValue } from "./enums.js";
import { isPresent } from "./format.js";
import { LANG_NOTE } from "./inputs.js";
import { PERIOD_NOTE, describeOutingFilters, outingFilterParams, searchOutingsSchema } from "./outings.js";
import type { OutingFilters } from "./outings.js";

// The largest page Camptocamp serves, and the most pages one call reads: 2,000 outings at most (AC4.5).
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
export const MAX_COLLECTED_OUTINGS = PAGE_SIZE * MAX_PAGES;

const RESULTS_CHANGED = "Camptocamp's results changed while counting; call again.";

// An outing published, edited or deleted between two pages shifts the others: one is read twice, or missed.
// The `-id` tiebreak keeps outings ending the same day in one order, so only such a change can do it.
// Two changes that cancel out between page reads (one outing deleted, another published) keep the total and
// the IDs right, so they are not detected: the counts may then mix the data before and after them.
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

const GROUP_BYS = ["month", "year", "condition"] as const;
type GroupBy = (typeof GROUP_BYS)[number];

// The search_outings filters, without paging (AC4.4 on #255); lang is kept, as every tool takes it.
export const outingStatsSchema = searchOutingsSchema.omit({ limit: true, offset: true }).extend({
  group_by: enumValue(GROUP_BYS).describe(
    "What to count by: month (of the start date, 01 to 12), year (of the start date) or condition (the conditions " +
      "the author reported)",
  ),
});

export type OutingStatsInput = z.infer<typeof outingStatsSchema>;

// AC4.6 on #255, in the output and the description.
export const COUNTS_NOTE =
  "Counts of trip reports published on Camptocamp, not of ascents; a month with no report is not evidence the route " +
  "is out of condition.";

const GROUP_LABELS: Record<GroupBy, string> = { month: "start month", year: "start year", condition: "condition" };

// The lines of outings counted outside the groups, so that the lines add up to the total.
const NO_START_DATE = "(no start date)";
const NOT_GIVEN = "(not given)";
const UNEXPECTED_FORMAT = "(unexpected format)";
const OUTSIDE_GROUPS = new Set([NO_START_DATE, NOT_GIVEN, UNEXPECTED_FORMAT]);

const START_DATE = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;

// The line an outing is counted on. A start date is read as sent, never taken from the end date; an item that
// failed its schema has no readable date or condition, and a start date not in YYYY-MM-DD form is not read either.
function lineOf(outing: OutingListResponse["documents"][number], groupBy: GroupBy): string {
  if (isMalformed(outing)) return UNEXPECTED_FORMAT;
  if (groupBy === "condition") return isPresent(outing.condition_rating) ? outing.condition_rating : NOT_GIVEN;
  const start = outing.date_start;
  if (!isPresent(start)) return NO_START_DATE;
  if (!START_DATE.test(start)) return UNEXPECTED_FORMAT;
  return groupBy === "month" ? start.slice(5, 7) : start.slice(0, 4);
}

// The groups printed for these counts, in order, zeros included.
function groupsOf(groupBy: GroupBy, counts: Map<string, number>): string[] {
  if (groupBy === "month") return Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  if (groupBy === "condition") {
    const known: readonly string[] = CONDITION_RATINGS;
    const unknown = [...counts.keys()].filter((code) => !known.includes(code) && !OUTSIDE_GROUPS.has(code)).sort();
    return [...known, ...unknown, NOT_GIVEN];
  }
  // Years are counted as written, 4 digits ("0999"), so they are printed padded back to 4 digits (#287).
  const years = [...counts.keys()].filter((key) => !OUTSIDE_GROUPS.has(key)).map(Number);
  if (years.length === 0) return [];
  const first = Math.min(...years);
  return Array.from({ length: Math.max(...years) - first + 1 }, (_, i) => String(first + i).padStart(4, "0"));
}

function formatCounts(response: OutingListResponse, filters: OutingFilters, groupBy: GroupBy): string {
  const counts = new Map<string, number>();
  for (const outing of response.documents) {
    const line = lineOf(outing, groupBy);
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const lines = groupsOf(groupBy, counts).map((group) => `${group}: ${String(counts.get(group) ?? 0)}`);
  for (const extra of [NO_START_DATE, UNEXPECTED_FORMAT]) {
    const count = counts.get(extra);
    if (count !== undefined) lines.push(`${extra}: ${String(count)}`);
  }

  const filterText = describeOutingFilters(filters).join(", ");
  const output = [`${String(response.total)} outing(s) counted (all matches), by ${GROUP_LABELS[groupBy]}`];
  if (filterText) output.push(`Filters: ${filterText}`);
  if (filters.period !== undefined) output.push(PERIOD_NOTE);
  output.push(COUNTS_NOTE);
  if (lines.length > 0) output.push("", ...lines);
  return output.join("\n");
}

// The filters are checked before any request: the collector's input type allows route_id with route_ids.
export async function handleOutingStats({ group_by, ...input }: OutingStatsInput): Promise<string> {
  const filters = outingFilterParams(input);
  const response = await collectMatchingOutings(filters);
  return formatCounts(response, filters, group_by);
}

export const outingStatsToolDefinitions = [
  {
    name: "outing_stats",
    title: "Count outings",
    description:
      "Count the outings (trip reports) on Camptocamp.org that match a search, by start month, start year or condition: for example, in which months a route's reports were written. It takes the filters of search_outings (query, area_id, activity, rating_system with rating_min / rating_max, condition_at_least, max_elevation_min / max_elevation_max, height_diff_up_min / height_diff_up_max, date_from / date_to, period_start / period_end, route_id or route_ids, waypoint_id, user_id), without limit and offset, and group_by: month, year or condition. Every matching outing is read, 100 per request, so the counts are exact. The output starts with 'N outing(s) counted (all matches), by start month' and the Filters line of search_outings, then one line per group, zeros included: months 01 to 12 of the start date; every year from the first to the last start date; or conditions excellent, good, average, poor, awful, any other code as sent, then '(not given): N'. A trip over several days counts in the month and year it starts. Outings without a start date count on '(no start date): N', and items Camptocamp sent in an unexpected format on '(unexpected format): N', so the lines add up to N. A search matching more than 2,000 outings is refused before counting, with its total: narrow the filters (dates, area, activity, routes). If Camptocamp's results change while counting, the call fails: call again. These are counts of trip reports published on Camptocamp, not of ascents; a month with no report is not evidence the route is out of condition. To read the reports, list them with search_outings and read them with get_outings. " +
      LANG_NOTE,
    inputSchema: outingStatsSchema,
    handler: handleOutingStats,
  },
];
