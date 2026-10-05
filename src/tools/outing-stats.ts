// outing_stats (S4 on #255): counts the outings matching a search by start month, start year or condition, and
// with split_by (S3 of #303) on a second of these axes, or per route of route_ids (S4 of #303), in a table. Counts
// come from the listed outings, never from separate API queries, so every page must be read and must agree with the
// others.
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

// One page of a set's search, sorted with the ID tiebreak. In HTTP mode, getJson waits for an upstream slot.
const readPage = (filters: OutingFilters, offset: number) =>
  searchOutings({ ...filters, limit: PAGE_SIZE, offset, tiebreak_by_id: true });

/**
 * Every outing of each set of filters: one result per set, in the order given, each in its search's order (most
 * recent first, ties by ID). Reads every set's first page, at most 3 at a time, then calls `checkTotals` with the
 * sets' totals, which throws to refuse them before any other request. Then reads the other pages of every set, at
 * most 3 at a time across all sets, and fails if a page fails or a set's pages disagree. `checkTotals` is the only
 * limit on how many requests it makes: one per set, then one per other page of 100 of every set it lets through.
 * An outing may be in several sets: each set is checked on its own.
 */
export async function collectOutingSets(
  sets: readonly OutingFilters[],
  checkTotals: (totals: number[]) => void,
): Promise<OutingListResponse[]> {
  const collections = await mapWithConcurrency(sets, MAX_PARALLEL_REQUESTS, async (filters) => {
    const { total, documents } = await readPage(filters, 0);
    return { filters, total, pages: [documents] };
  });
  checkTotals(collections.map(({ total }) => total));

  const reads = collections.flatMap((collection) => {
    const offsets: number[] = [];
    for (let offset = PAGE_SIZE; offset < collection.total; offset += PAGE_SIZE) offsets.push(offset);
    return offsets.map((offset) => ({ collection, offset }));
  });
  await mapWithConcurrency(reads, MAX_PARALLEL_REQUESTS, async ({ collection, offset }) => {
    const page = await readPage(collection.filters, offset);
    if (page.total !== collection.total) throw new Error(RESULTS_CHANGED);
    collection.pages[offset / PAGE_SIZE] = page.documents;
  });

  return collections.map(({ total, pages }) => {
    const documents = pages.flat();
    assertComplete(documents, total);
    return { total, documents };
  });
}

const formatCount = (count: number) => count.toLocaleString("en-US");

// The refusal of more outings than one call reads, after `matched`, which says how many match.
function tooManyOutings(matched: string): Error {
  return new Error(
    `${matched}, more than the ${formatCount(MAX_COLLECTED_OUTINGS)} that can be counted in one call: narrow the ` +
      "filters (dates, area, activity, routes…) and call again.",
  );
}

/**
 * Every outing matching `filters`, in the search's order (most recent first, ties by ID). Refuses a search
 * matching more than 2,000 outings after its first page, and fails if a page fails or the pages disagree.
 */
export async function collectMatchingOutings(filters: OutingFilters): Promise<OutingListResponse> {
  const [result] = await collectOutingSets([filters], (totals) => {
    for (const total of totals) {
      if (total > MAX_COLLECTED_OUTINGS) throw tooManyOutings(`${formatCount(total)} outings match these filters`);
    }
  });
  // One set of filters gives one result.
  return result as OutingListResponse;
}

const AXES = ["month", "year", "condition"] as const;
type Axis = (typeof AXES)[number];
// The second axis: another of AXES, or the routes of route_ids (S4 of #303).
const SPLITS = [...AXES, "route"] as const;
type Split = (typeof SPLITS)[number];

// The search_outings filters, without paging (AC4.4 on #255); lang is kept, as every tool takes it.
export const outingStatsSchema = searchOutingsSchema.omit({ limit: true, offset: true }).extend({
  group_by: enumValue(AXES).describe(
    "What to count by: month (of the start date, 01 to 12), year (of the start date) or condition (the conditions " +
      "the author reported)",
  ),
  // No zod default and no .refine: server.ts reads the shape, so split_by equal to group_by is refused by the handler.
  split_by: enumValue(SPLITS)
    .optional()
    .describe(
      "A second axis, another of month, year or condition: prints a Markdown table of counts instead, one row per " +
        "group_by value and one column per split_by value, with a total row and column. route (with route_ids, not " +
        "route_id): one column per route, then an 'all routes' column of distinct outings instead of the total " +
        "column; an outing linked to several of these routes counts under each",
    ),
});

export type OutingStatsInput = z.infer<typeof outingStatsSchema>;

// AC4.6 on #255, in the output and the description.
export const COUNTS_NOTE =
  "Counts of trip reports published on Camptocamp, not of ascents; a month with no report is not evidence the route " +
  "is out of condition.";

const AXIS_LABELS: Record<Split, string> = {
  month: "start month",
  year: "start year",
  condition: "condition",
  route: "route",
};

// The lines of outings counted outside the groups, so that the lines add up to the total.
const NO_START_DATE = "(no start date)";
const NOT_GIVEN = "(not given)";
const UNEXPECTED_FORMAT = "(unexpected format)";
const OUTSIDE_GROUPS = new Set([NO_START_DATE, NOT_GIVEN, UNEXPECTED_FORMAT]);
// The lines counted below a table; (not given) is a condition row or column of the table.
const OUTSIDE_TABLE = [NO_START_DATE, UNEXPECTED_FORMAT];

const START_DATE = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;

type Outing = OutingListResponse["documents"][number];

// The value an outing is counted on, for one axis. A start date is read as sent, never taken from the end date; an
// item that failed its schema has no readable date or condition, and a start date not in YYYY-MM-DD form is not
// read either.
function keyOf(outing: Outing, axis: Axis): string {
  if (isMalformed(outing)) return UNEXPECTED_FORMAT;
  if (axis === "condition") return isPresent(outing.condition_rating) ? outing.condition_rating : NOT_GIVEN;
  const start = outing.date_start;
  if (!isPresent(start)) return NO_START_DATE;
  if (!START_DATE.test(start)) return UNEXPECTED_FORMAT;
  return axis === "month" ? start.slice(5, 7) : start.slice(0, 4);
}

// The values printed for an axis whose counted outings have these keys, in order, zeros included.
function axisValues(axis: Axis, keys: Iterable<string>): string[] {
  if (axis === "month") return Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  if (axis === "condition") {
    const known: readonly string[] = CONDITION_RATINGS;
    const unknown = [...new Set(keys)].filter((code) => !known.includes(code) && !OUTSIDE_GROUPS.has(code)).sort();
    return [...known, ...unknown, NOT_GIVEN];
  }
  // Years are counted as written, 4 digits ("0999"), so they are printed padded back to 4 digits (#287).
  const years = [...keys].filter((key) => !OUTSIDE_GROUPS.has(key)).map(Number);
  if (years.length === 0) return [];
  const first = Math.min(...years);
  return Array.from({ length: Math.max(...years) - first + 1 }, (_, i) => String(first + i).padStart(4, "0"));
}

function increment<K>(counts: Map<K, number>, key: K): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

// The lines of the outings counted outside the groups or the table, printed only when there are any.
function outsideLines(counts: Map<string, number>): string[] {
  return OUTSIDE_TABLE.flatMap((key) => {
    const count = counts.get(key);
    return count === undefined ? [] : [`${key}: ${String(count)}`];
  });
}

function formatCounts(documents: Outing[], groupBy: Axis): string[] {
  const counts = new Map<string, number>();
  for (const outing of documents) increment(counts, keyOf(outing, groupBy));
  const lines = axisValues(groupBy, counts.keys()).map((group) => `${group}: ${String(counts.get(group) ?? 0)}`);
  return [...lines, ...outsideLines(counts)];
}

// A condition code is printed as Camptocamp sends it, so a | in it is escaped to stay in its cell.
const cell = (value: string) => value.replaceAll("|", "\\|");
const tableRow = (cells: string[]) => `| ${cells.join(" | ")} |`;

// A Markdown table of counts, `count(row, column)` in each cell, with a total row; with `totalColumn`, a last
// column gives each row's total.
function countTable(
  label: string,
  columns: string[],
  rows: string[],
  count: (row: string, column: number) => number,
  totalColumn: boolean,
): string[] {
  const extra = totalColumn ? ["total"] : [];
  const line = (counts: number[]) => (totalColumn ? [...counts, sum(counts)] : counts).map(String);
  const columnTotal = (column: number) => sum(rows.map((row) => count(row, column)));
  return [
    tableRow([label, ...columns.map(cell), ...extra]),
    tableRow(["---", ...[...columns, ...extra].map(() => "---:")]),
    ...rows.map((row) => tableRow([cell(row), ...line(columns.map((_, column) => count(row, column)))])),
    tableRow(["total", ...line(columns.map((_, column) => columnTotal(column)))]),
  ];
}

// A blank line ends a table: a line right after it would be read as one more row.
const withBelow = (table: string[], below: string[]) => (below.length > 0 ? [...table, "", ...below] : table);

// Rows from group_by, columns from split_by, with a total column and row: counts only (AC3.3 of #303). An outing
// with either value outside the axes is counted below the table, so the table and those lines add up to N.
function formatTable(documents: Outing[], rowAxis: Axis, columnAxis: Axis): string[] {
  const cells = new Map<string, number>();
  const outside = new Map<string, number>();
  const rowKeys: string[] = [];
  const columnKeys: string[] = [];
  for (const outing of documents) {
    const row = keyOf(outing, rowAxis);
    const column = keyOf(outing, columnAxis);
    const off = OUTSIDE_TABLE.find((key) => key === row || key === column);
    if (off !== undefined) {
      increment(outside, off);
    } else {
      rowKeys.push(row);
      columnKeys.push(column);
      increment(cells, JSON.stringify([row, column]));
    }
  }
  const rows = axisValues(rowAxis, rowKeys);
  const columns = axisValues(columnAxis, columnKeys);
  const below = outsideLines(outside);
  // Without a year with a start date there is no row or column to print, as there is no year line without split_by.
  if (rows.length === 0 || columns.length === 0) return below;

  const count = (row: string, column: number) => cells.get(JSON.stringify([row, columns[column]])) ?? 0;
  return withBelow(countTable(AXIS_LABELS[rowAxis], columns, rows, count, true), below);
}

const ROUTE_SPLIT_NEEDS_ROUTE_IDS =
  'split_by "route" counts the routes of route_ids: give the routes to compare in route_ids (up to 10), not route_id.';

const idsOf = (documents: Outing[]) => documents.flatMap(({ document_id }) => document_id ?? []);

// split_by route (S4 of #303): the union of the routes first, then each route's outings, in route_ids order. An
// outing linked to several routes is read once per route, so the routes' totals are refused above 2,000; the union
// cannot hold more outings than they add up to. Items without an ID cannot be matched, so they are not checked.
async function collectRouteSets(others: Omit<OutingFilters, "route_ids">, routeIds: number[]) {
  const sets = [{ ...others, route_ids: routeIds }, ...routeIds.map((route_id) => ({ ...others, route_id }))];
  const [union, ...routes] = await collectOutingSets(sets, ([unionTotal, ...routeTotals]) => {
    const routeSum = sum(routeTotals);
    if (routeSum > MAX_COLLECTED_OUTINGS) {
      const perRoute = routeIds.map((id, i) => `route ${String(id)}: ${formatCount(routeTotals[i])}`).join(", ");
      throw tooManyOutings(`${formatCount(routeSum)} outings match these filters route by route (${perRoute})`);
    }
    if (unionTotal > routeSum) throw new Error(RESULTS_CHANGED);
  });
  // How many of the routes each outing is linked to; the union must hold exactly these outings.
  const linked = new Map<number, number>();
  for (const { documents } of routes) for (const id of new Set(idsOf(documents))) increment(linked, id);
  const unionIds = new Set(idsOf(union.documents));
  if (unionIds.size !== linked.size || [...linked.keys()].some((id) => !unionIds.has(id))) {
    throw new Error(RESULTS_CHANGED);
  }
  const shared = [...linked.values()].filter((count) => count > 1).length;
  return { union, routes, shared };
}

// Rows from group_by, one column per route, then `all routes`, counted from the union: an outing linked to several
// routes counts in each of their columns, and once in `all routes`. The outings outside the rows are counted once,
// from the union, below the table, so the `all routes` column and those lines add up to N.
function formatRouteTable(rowAxis: Axis, routeIds: number[], columnSets: Outing[][]): string[] {
  const columns = columnSets.map((documents) => {
    const counts = new Map<string, number>();
    for (const outing of documents) increment(counts, keyOf(outing, rowAxis));
    return counts;
  });
  const below = outsideLines(columns[columns.length - 1]);
  const rows = axisValues(rowAxis, columns.flatMap((counts) => [...counts.keys()]));
  if (rows.length === 0) return below;
  const labels = [...routeIds.map(String), "all routes"];
  const table = countTable(AXIS_LABELS[rowAxis], labels, rows, (row, column) => columns[column].get(row) ?? 0, false);
  return withBelow(table, below);
}

// The counts, and the lines printed before them, for the filters of a call. split_by route without route_ids is
// refused here, before any request.
async function countOutings(filters: OutingFilters, groupBy: Axis, splitBy: Split | undefined) {
  if (splitBy === "route") {
    const { route_ids: routeIds, ...others } = filters;
    if (routeIds === undefined) throw new Error(ROUTE_SPLIT_NEEDS_ROUTE_IDS);
    const { union, routes, shared } = await collectRouteSets(others, routeIds);
    const columnSets = [...routes, union].map(({ documents }) => documents);
    return {
      total: union.total,
      notes: [`${String(shared)} outing(s) are linked to more than one of these routes and count under each.`],
      lines: formatRouteTable(groupBy, routeIds, columnSets),
    };
  }
  const { total, documents } = await collectMatchingOutings(filters);
  const lines = splitBy === undefined ? formatCounts(documents, groupBy) : formatTable(documents, groupBy, splitBy);
  return { total, notes: [], lines };
}

// split_by equal to group_by is refused first, then the filters are checked, then split_by route without route_ids,
// all before any request: the collector's input type allows route_id with route_ids.
export async function handleOutingStats({ group_by, split_by, ...input }: OutingStatsInput): Promise<string> {
  if (split_by === group_by) {
    throw new Error(
      `split_by must differ from group_by (${group_by}): give another of month, year, condition or route, or leave ` +
        "it out",
    );
  }
  const filters = outingFilterParams(input);
  const { total, notes, lines } = await countOutings(filters, group_by, split_by);

  const filterText = describeOutingFilters(filters).join(", ");
  const axes = AXIS_LABELS[group_by] + (split_by === undefined ? "" : ` and ${AXIS_LABELS[split_by]}`);
  const output = [`${String(total)} outing(s) counted (all matches), by ${axes}`];
  if (filterText) output.push(`Filters: ${filterText}`);
  if (filters.period !== undefined) output.push(PERIOD_NOTE);
  output.push(COUNTS_NOTE, ...notes);
  if (lines.length > 0) output.push("", ...lines);
  return output.join("\n");
}

export const outingStatsToolDefinitions = [
  {
    name: "outing_stats",
    title: "Count outings",
    description:
      "Count the outings (trip reports) on Camptocamp.org that match a search, by start month, start year or condition. It takes the filters of search_outings (query, area_id, activity, rating_system with rating_min / rating_max, condition_at_least, max_elevation_min / max_elevation_max, height_diff_up_min / height_diff_up_max, date_from / date_to, period_start / period_end, route_id or route_ids, waypoint_id, user_id), without limit and offset, and group_by: month, year or condition. Every matching outing is read, so the counts are exact. The output starts with 'N outing(s) counted (all matches), by start month' and a Filters line, then one line per group, zeros included: months 01 to 12; every year from the first to the last start date; or conditions excellent, good, average, poor, awful, any other code as sent, then '(not given): N'. A trip over several days counts in the month and year it starts. Outings without a start date count on '(no start date): N', and items Camptocamp sent in an unexpected format on '(unexpected format): N', so the lines add up to N. With split_by (another of month, year or condition), a Markdown table instead: group_by rows, split_by columns, a total row and column, counts only; those two lines follow it. split_by route (with route_ids): a column per route, then 'all routes' (distinct outings) instead of total; an outing on several routes counts under each. A search matching more than 2,000 outings (summed per route for split_by route) is refused before counting: narrow the filters (dates, area, activity, routes). If Camptocamp's results change while counting, the call fails: call again. These are counts of trip reports published on Camptocamp, not of ascents; a month with no report is not evidence the route is out of condition. Read the reports with search_outings and get_outings. " +
      LANG_NOTE,
    inputSchema: outingStatsSchema,
    handler: handleOutingStats,
  },
];
