import { z } from "zod";
import { documentId, searchOffset, searchQuery } from "./inputs.js";
import { assertResultWindow, formatSearchPage } from "./paging.js";
import { getOuting, searchOutings } from "../api/camptocamp.js";
import type { OutingDetail, OutingListItem, OutingListResponse } from "../api/camptocamp.js";
import {
  pickLocale,
  pickTitle,
  isPresent,
  formatDateRange,
  formatHeader,
  formatAssociatedRouteLine,
} from "./format.js";
import { formatRatingLines, formatRatingParts } from "./ratings.js";
import { formatUserText, USER_TEXT_NOTE } from "./text.js";

export const getOutingSchema = z.object({
  id: documentId("Outing ID from Camptocamp"),
});

export const OUTING_ACTIVITIES = [
  "skitouring",
  "snow_ice_mixed",
  "mountain_climbing",
  "rock_climbing",
  "ice_climbing",
  "hiking",
  "snowshoeing",
  "paragliding",
  "mountain_biking",
  "via_ferrata",
  "slacklining",
] as const;

// The API answers 500 to impossible dates such as 2026-02-30, and ignores malformed ones.
function isRealDate(s: string): boolean {
  const date = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === s;
}

// Factories, not shared instances: a shared instance becomes a JSON Schema `$ref` to the first
// field using it, and strict clients then show that field's description for the others.
const DATE_MESSAGE = "must be a real date in YYYY-MM-DD format";
const isoDate = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, DATE_MESSAGE)
    .refine(isRealDate, DATE_MESSAGE);

// A day of the year for `period`, checked in 2020 (a leap year) like the API layer sends it.
const PERIOD_DAY_MESSAGE = "must be a real day in MM-DD format (e.g. 06-01; 02-29 allowed)";
const periodDay = () =>
  z
    .string()
    .regex(/^\d{2}-\d{2}$/, PERIOD_DAY_MESSAGE)
    .refine((s) => isRealDate(`2020-${s}`), PERIOD_DAY_MESSAGE);

export const searchOutingsSchema = z.object({
  query: searchQuery("Keyword matched against outing titles (e.g. 'cosmiques')", { allowBlank: true }).optional(),
  area_id: documentId("Camptocamp area ID from search_areas (e.g. 14409 for Vanoise)").optional(),
  activity: z
    .enum(OUTING_ACTIVITIES, {
      errorMap: () => ({ message: `must be one of: ${OUTING_ACTIVITIES.join(", ")}` }),
    })
    .optional()
    .describe(`Activity, one of: ${OUTING_ACTIVITIES.join(", ")}`),
  date_from: isoDate()
    .optional()
    .describe("Earliest date (YYYY-MM-DD); matches outings whose date range ends on or after it"),
  date_to: isoDate()
    .optional()
    .describe("Latest date (YYYY-MM-DD); matches outings whose date range starts on or before it"),
  period_start: periodDay()
    .optional()
    .describe("First day (MM-DD) of a period matched in every year; give period_end too (e.g. 06-01)"),
  period_end: periodDay()
    .optional()
    .describe("Last day (MM-DD) of a period matched in every year, on or after period_start (e.g. 06-30)"),
  route_id: documentId("Camptocamp route ID from search_routes").optional(),
  waypoint_id: documentId("Camptocamp waypoint ID from search_waypoints").optional(),
  user_id: documentId("Camptocamp user ID of the outings' author (the number in their profile URL)").optional(),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  offset: searchOffset(),
});

// search_user_outings: the user_id, limit and offset of search_outings, nothing else.
export const searchUserOutingsSchema = z.object({
  user_id: documentId("Camptocamp user ID of the outings' author (the number in their profile URL)"),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  offset: searchOffset(),
});

export type SearchUserOutingsInput = z.infer<typeof searchUserOutingsSchema>;
export type GetOutingInput = z.infer<typeof getOutingSchema>;
export type SearchOutingsInput = z.infer<typeof searchOutingsSchema>;

function formatOutingDetail(outing: OutingDetail): string {
  const locale = pickLocale(outing.locales);
  const lines: string[] = [];

  lines.push(...formatHeader(pickTitle(outing.locales), outing.document_id, "outings"));

  if (outing.author) {
    lines.push(`**Author**: ${outing.author.name} (user ID: ${outing.author.user_id})`);
  }

  lines.push(`\n**Activities**: ${outing.activities.join(", ")}`);

  const date = formatDateRange(outing.date_start, outing.date_end);
  if (date) lines.push(`**Date**: ${date}`);
  if (isPresent(outing.participant_count)) lines.push(`**Participants**: ${outing.participant_count}`);

  lines.push(...formatRatingLines(outing));
  if (outing.condition_rating) lines.push(`**Conditions**: ${outing.condition_rating}`);

  if (isPresent(outing.elevation_max)) lines.push(`**Max elevation**: ${outing.elevation_max}m`);
  if (isPresent(outing.elevation_min)) lines.push(`**Min elevation**: ${outing.elevation_min}m`);
  if (isPresent(outing.height_diff_up)) lines.push(`**Elevation gain**: ${outing.height_diff_up}m`);
  if (isPresent(outing.height_diff_down)) lines.push(`**Elevation loss**: ${outing.height_diff_down}m`);

  lines.push(...formatUserText("description", "Description", locale?.description));
  lines.push(...formatUserText("route_description", "Route description", locale?.route_description));
  lines.push(...formatUserText("conditions", "Conditions", locale?.conditions));
  lines.push(...formatUserText("weather", "Weather", locale?.weather));
  lines.push(...formatUserText("timing", "Timing", locale?.timing));
  lines.push(...formatUserText("participants", "Participants", locale?.participants));

  const routes = outing.associations?.routes;
  if (routes && routes.length > 0) {
    lines.push("\n## Associated routes", ...routes.map(formatAssociatedRouteLine));
  }

  return lines.join("\n");
}

function describeFilters(params: SearchOutingsInput): string[] {
  const filters: string[] = [];
  if (params.user_id !== undefined) filters.push(`user ${params.user_id}`);
  if (params.query !== undefined) filters.push(`query "${params.query}"`);
  if (params.area_id !== undefined) filters.push(`area ${params.area_id}`);
  if (params.activity !== undefined) filters.push(`activity ${params.activity}`);
  if (params.date_from !== undefined && params.date_to !== undefined) {
    filters.push(`dates ${params.date_from} → ${params.date_to}`);
  } else if (params.date_from !== undefined) {
    filters.push(`dates from ${params.date_from}`);
  } else if (params.date_to !== undefined) {
    filters.push(`dates until ${params.date_to}`);
  }
  if (params.period_start !== undefined && params.period_end !== undefined) {
    filters.push(`period ${params.period_start} → ${params.period_end} of every year`);
  }
  if (params.route_id !== undefined) filters.push(`route ${params.route_id}`);
  if (params.waypoint_id !== undefined) filters.push(`waypoint ${params.waypoint_id}`);
  return filters;
}

function formatOutingLine(outing: OutingListItem): string {
  const parts: string[] = [];
  const push = (label: string, value: string | number | null | undefined, unit = ""): void => {
    if (isPresent(value)) parts.push(`${label}${value}${unit}`);
  };

  push("", formatDateRange(outing.date_start, outing.date_end));
  push("Conditions: ", outing.condition_rating);
  push("Max elevation: ", outing.elevation_max, "m");
  push("Elevation gain: ", outing.height_diff_up, "m");
  parts.push(...formatRatingParts(outing));

  const ranges = (outing.areas ?? []).filter((area) => area.area_type === "range");
  if (ranges.length > 0) {
    parts.push(`Areas: ${ranges.map((area) => `${pickTitle(area.locales)} [${area.document_id}]`).join(", ")}`);
  }
  push("Author: ", outing.author?.name);

  const head = `- [${outing.document_id}] ${pickTitle(outing.locales)} (${outing.activities.join(", ")})`;
  return [head, ...parts].join(" | ");
}

// D1: the period is sent as given, so no outing outside it is shown, and the gap is stated.
// Camptocamp computes it with a 365.2425-day year, so a boundary day can drop out depending on the year.
const PERIOD_NOTE = "Note: Camptocamp's period filter can miss outings on the first or last day of the range.";

function formatOutingList(response: OutingListResponse, params: SearchOutingsInput): string {
  return formatSearchPage({
    kind: "outing",
    total: response.total,
    offset: params.offset,
    limit: params.limit,
    lines: response.documents.map(formatOutingLine),
    filters: describeFilters(params),
    notes: params.period_start !== undefined ? [PERIOD_NOTE] : [],
    order: ", most recent first",
  });
}

// The SDK has already validated `input` against searchOutingsSchema and applied its defaults.
export async function handleSearchOutings(input: SearchOutingsInput): Promise<string> {
  const { query, ...rest } = input;
  // A blank query counts as missing: the API treats `q=` like no `q` and returns every outing.
  const params: SearchOutingsInput = query?.trim() ? { query, ...rest } : rest;

  if (params.date_from !== undefined && params.date_to !== undefined && params.date_from > params.date_to) {
    throw new Error(`date_from (${params.date_from}) must be on or before date_to (${params.date_to}).`);
  }
  const { period_start, period_end, ...filters } = params;
  if ((period_start === undefined) !== (period_end === undefined)) {
    throw new Error("period_start and period_end must be given together (MM-DD, e.g. 06-01 and 06-30).");
  }
  if (period_start !== undefined && period_end !== undefined && period_start > period_end) {
    // Camptocamp returns no outing at all for a wrapping period.
    throw new Error(
      `period cannot wrap around the new year; make two calls (${period_start} → 12-31 and 01-01 → ${period_end})`,
    );
  }
  assertResultWindow(params.offset, params.limit);

  const period =
    period_start !== undefined && period_end !== undefined ? { start: period_start, end: period_end } : undefined;
  const response = await searchOutings(period ? { ...filters, period } : filters);
  return formatOutingList(response, params);
}

// AC5.6: a thin alias, so its output is exactly that of search_outings for the same user.
export async function handleSearchUserOutings(input: SearchUserOutingsInput): Promise<string> {
  return handleSearchOutings(input);
}

export async function handleGetOuting(input: GetOutingInput): Promise<string> {
  const outing = await getOuting(input.id);
  return formatOutingDetail(outing);
}

export const outingToolDefinitions = [
  {
    name: "search_user_outings",
    title: "List a user's outings",
    description:
      "List outings (trip reports) published by a Camptocamp user, most recent first: an alias of search_outings with only user_id (the number in the author's camptocamp.org profile URL), limit and offset, returning exactly what search_outings returns for that user_id. Each result shows ID, title, activities, dates, condition rating, max elevation, elevation gain, difficulty ratings labelled by grading system (e.g. 'Ski rating (Toponeige): 4.1 | Labande: AD | Global rating: F'), mountain ranges and author. Use offset to page (offset + limit ≤ 10,000): the output ends with 'Next page: offset=N' when more outings follow. To filter a user's outings by area, activity, dates, period, route or waypoint, call search_outings with user_id. An unknown user ID yields no results, not an error.",
    inputSchema: searchUserOutingsSchema,
    handler: handleSearchUserOutings,
  },
  {
    name: "get_outing",
    title: "Get outing details",
    description:
      "Get full details of a specific outing (trip report) from Camptocamp.org by its ID, including every rating labelled by its grading system (e.g. 'Ski rating (Toponeige)', 'Labande', 'Global rating'), description, conditions, weather, participants, and associated routes (named '<summit> : <route title>', followed by their ratings). The second line is the document's camptocamp.org URL, to cite as the source. " +
      USER_TEXT_NOTE,
    inputSchema: getOutingSchema,
    handler: handleGetOuting,
  },
  {
    name: "search_outings",
    title: "Search outings",
    description:
      "Search outings (trip reports) across all of Camptocamp.org, most recent first (by end date, keyword searches included). All filters are optional and combine with AND: query (keyword), area_id (from search_areas), activity, date_from / date_to (YYYY-MM-DD; an outing matches if its date range overlaps the requested range — give one bound only for 'since' / 'until'), period_start / period_end (MM-DD, both together; the same days in every year, e.g. 06-01 → 06-30 for all Junes; combine with date_from / date_to to limit the years; a period cannot wrap around the new year, so make two calls for 12-20 → 01-10; Camptocamp's period filter can miss outings on the first or last day of the range), route_id (from search_routes), waypoint_id (from search_waypoints), user_id (the author's Camptocamp user ID). Each result shows ID, title, activities, dates, condition rating, max elevation, elevation gain, difficulty ratings labelled by grading system (e.g. 'Ski rating (Toponeige): 4.1 | Labande: AD | Global rating: F'), mountain ranges and author. Use offset to page (offset + limit ≤ 10,000): the output ends with 'Next page: offset=N' when more outings follow — or 'Next page: offset=N (limit at most M)' near the window's end, where limit must be lowered to M — or says when they lie beyond Camptocamp's 10,000-result window. An unknown area/route/waypoint/user ID yields no results, not an error. Call get_outing with an ID for the full conditions, weather and report text.",
    inputSchema: searchOutingsSchema,
    handler: handleSearchOutings,
  },
];
