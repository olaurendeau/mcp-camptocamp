import { z } from "zod";
import { searchUserOutings, getOuting, searchOutings } from "../api/camptocamp.js";
import type {
  OutingSearchResponse,
  OutingDetail,
  OutingListItem,
  OutingListResponse,
  OutingSearchParams,
} from "../api/camptocamp.js";
import { pickLocale, pickTitle, formatHeader, formatTitledLine } from "./format.js";

export const searchUserOutingsSchema = z.object({
  user_id: z.number().int().positive().describe("Camptocamp user ID (e.g. 430052 for username o.laurendeau)"),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
});

export const getOutingSchema = z.object({
  id: z.number().int().positive().describe("Outing ID from Camptocamp"),
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

const DATE_MESSAGE = "must be a real date in YYYY-MM-DD format";
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, DATE_MESSAGE)
  .refine(isRealDate, DATE_MESSAGE);

// Camptocamp refuses any search where offset + limit goes past this many results.
const MAX_RESULT_WINDOW = 10000;

export const searchOutingsSchema = z.object({
  query: z.string().optional().describe("Keyword matched against outing titles (e.g. 'cosmiques')"),
  area_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Camptocamp area ID from search_areas (e.g. 14409 for Vanoise)"),
  activity: z
    .enum(OUTING_ACTIVITIES, {
      errorMap: () => ({ message: `must be one of: ${OUTING_ACTIVITIES.join(", ")}` }),
    })
    .optional()
    .describe(`Activity, one of: ${OUTING_ACTIVITIES.join(", ")}`),
  date_from: isoDate
    .optional()
    .describe("Earliest date (YYYY-MM-DD); matches outings whose date range ends on or after it"),
  date_to: isoDate
    .optional()
    .describe("Latest date (YYYY-MM-DD); matches outings whose date range starts on or before it"),
  route_id: z.number().int().positive().optional().describe("Camptocamp route ID from search_routes"),
  waypoint_id: z.number().int().positive().optional().describe("Camptocamp waypoint ID from search_waypoints"),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Number of results to skip, for paging (offset + limit ≤ 10,000)"),
});

export type SearchUserOutingsInput = z.infer<typeof searchUserOutingsSchema>;
export type GetOutingInput = z.infer<typeof getOutingSchema>;
export type SearchOutingsInput = z.input<typeof searchOutingsSchema>;

function formatDateRange(dateStart?: string, dateEnd?: string): string {
  if (!dateStart) return "";
  if (!dateEnd || dateStart === dateEnd) return dateStart;
  return `${dateStart} → ${dateEnd}`;
}

function formatOutingSearchResult(response: OutingSearchResponse, userId: number): string {
  if (response.documents.length === 0) {
    return `No outings found for user ${userId}.`;
  }

  const lines: string[] = [
    `Found ${response.total} outing(s) for user ${userId}. Showing ${response.documents.length}:\n`,
  ];

  for (const outing of response.documents) {
    const title = pickTitle(outing.locales);
    const activities = outing.activities.join(", ");
    const date = formatDateRange(outing.date_start, outing.date_end);
    const datePart = date ? ` | ${date}` : "";
    const elevation = outing.elevation_max ? ` | Max elevation: ${outing.elevation_max}m` : "";
    const rating = outing.global_rating ? ` | Rating: ${outing.global_rating}` : "";

    lines.push(`- [${outing.document_id}] ${title} (${activities})${datePart}${elevation}${rating}`);
  }

  return lines.join("\n");
}

function formatOutingDetail(outing: OutingDetail): string {
  const locale = pickLocale(outing.locales);
  const lines: string[] = [];

  lines.push(formatHeader(locale?.title ?? "Untitled", outing.document_id));

  if (outing.author) {
    lines.push(`**Author**: ${outing.author.name} (user ID: ${outing.author.user_id})`);
  }

  lines.push(`\n**Activities**: ${outing.activities.join(", ")}`);

  const date = formatDateRange(outing.date_start, outing.date_end);
  if (date) lines.push(`**Date**: ${date}`);
  if (outing.participant_count) lines.push(`**Participants**: ${outing.participant_count}`);

  if (outing.global_rating) lines.push(`**Global rating**: ${outing.global_rating}`);
  if (outing.hiking_rating) lines.push(`**Hiking rating**: ${outing.hiking_rating}`);
  if (outing.rock_free_rating) lines.push(`**Rock free rating**: ${outing.rock_free_rating}`);
  if (outing.engagement_rating) lines.push(`**Engagement**: ${outing.engagement_rating}`);
  if (outing.equipment_rating) lines.push(`**Equipment**: ${outing.equipment_rating}`);
  if (outing.condition_rating) lines.push(`**Conditions**: ${outing.condition_rating}`);

  if (outing.elevation_max) lines.push(`**Max elevation**: ${outing.elevation_max}m`);
  if (outing.elevation_min) lines.push(`**Min elevation**: ${outing.elevation_min}m`);
  if (outing.height_diff_up) lines.push(`**Elevation gain**: ${outing.height_diff_up}m`);
  if (outing.height_diff_down) lines.push(`**Elevation loss**: ${outing.height_diff_down}m`);

  if (locale?.description) {
    lines.push(`\n## Description\n${locale.description}`);
  }

  if (locale?.route_description) {
    lines.push(`\n## Route description\n${locale.route_description}`);
  }

  if (locale?.conditions) {
    lines.push(`\n## Conditions\n${locale.conditions}`);
  }

  if (locale?.weather) {
    lines.push(`\n## Weather\n${locale.weather}`);
  }

  if (locale?.timing) {
    lines.push(`\n## Timing\n${locale.timing}`);
  }

  if (locale?.participants) {
    lines.push(`\n## Participants\n${locale.participants}`);
  }

  const routes = outing.associations?.routes;
  if (routes && routes.length > 0) {
    lines.push("\n## Associated routes", ...routes.map(formatTitledLine));
  }

  return lines.join("\n");
}

function isPresent<T>(value: T | null | undefined | ""): value is T {
  return value != null && value !== "";
}

function describeFilters(params: OutingSearchParams): string {
  const filters: string[] = [];
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
  if (params.route_id !== undefined) filters.push(`route ${params.route_id}`);
  if (params.waypoint_id !== undefined) filters.push(`waypoint ${params.waypoint_id}`);
  return filters.join(", ");
}

function formatOutingLine(outing: OutingListItem): string {
  const parts: string[] = [];
  const push = (label: string, value: string | number | null | undefined, unit = ""): void => {
    if (isPresent(value)) parts.push(`${label}${value}${unit}`);
  };

  push("", formatDateRange(outing.date_start ?? undefined, outing.date_end ?? undefined));
  push("Conditions: ", outing.condition_rating);
  push("Max elevation: ", outing.elevation_max, "m");
  push("Elevation gain: ", outing.height_diff_up, "m");
  push("Global rating: ", outing.global_rating);
  push("Ski rating: ", outing.ski_rating);
  push("Labande: ", outing.labande_global_rating);
  push("Rock free rating: ", outing.rock_free_rating);
  push("Ice rating: ", outing.ice_rating);
  push("Hiking rating: ", outing.hiking_rating);
  push("Snowshoe rating: ", outing.snowshoe_rating);

  const ranges = (outing.areas ?? []).filter((area) => area.area_type === "range");
  if (ranges.length > 0) {
    parts.push(`Areas: ${ranges.map((area) => `${pickTitle(area.locales)} [${area.document_id}]`).join(", ")}`);
  }
  push("Author: ", outing.author?.name);

  const head = `- [${outing.document_id}] ${pickTitle(outing.locales)} (${outing.activities.join(", ")})`;
  return [head, ...parts].join(" | ");
}

function formatOutingList(response: OutingListResponse, params: OutingSearchParams): string {
  const filters = describeFilters(params);
  if (response.total === 0) {
    return filters ? `No outings found matching ${filters}.` : "No outings found.";
  }

  const lines: string[] = [
    `Found ${response.total} outing(s), most recent first. Showing ${response.documents.length} from offset ${params.offset ?? 0}:`,
  ];
  if (filters) lines.push(`Filters: ${filters}`);
  lines.push("");
  lines.push(...response.documents.map(formatOutingLine));
  return lines.join("\n");
}

export async function handleSearchOutings(input: SearchOutingsInput): Promise<string> {
  const parsed = searchOutingsSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`);
    throw new Error(`Invalid search_outings input: ${[...new Set(issues)].join("; ")}`);
  }

  const { query, ...rest } = parsed.data;
  // A blank query counts as missing: the API treats `q=` like no `q` and returns every outing.
  const params: OutingSearchParams = query?.trim() ? { query, ...rest } : rest;

  if (params.date_from !== undefined && params.date_to !== undefined && params.date_from > params.date_to) {
    throw new Error(`date_from (${params.date_from}) must be on or before date_to (${params.date_to}).`);
  }
  if (rest.offset + rest.limit > MAX_RESULT_WINDOW) {
    throw new Error(
      `offset + limit must not exceed ${MAX_RESULT_WINDOW}: Camptocamp only returns the first 10,000 results of a search. Narrow the filters instead.`,
    );
  }

  const response = await searchOutings(params);
  return formatOutingList(response, params);
}

export async function handleSearchUserOutings(input: SearchUserOutingsInput): Promise<string> {
  const response = await searchUserOutings(input.user_id, input.limit);
  return formatOutingSearchResult(response, input.user_id);
}

export async function handleGetOuting(input: GetOutingInput): Promise<string> {
  const outing = await getOuting(input.id);
  return formatOutingDetail(outing);
}

export const outingToolDefinitions = [
  {
    name: "search_user_outings",
    description:
      "List outings (trip reports) published by a Camptocamp user. Returns outings with ID, title, activities, date, elevation, and rating. Use the user_id from the Camptocamp profile URL (e.g. u=430052).",
    inputSchema: searchUserOutingsSchema,
    handler: handleSearchUserOutings,
  },
  {
    name: "get_outing",
    description:
      "Get full details of a specific outing (trip report) from Camptocamp.org by its ID, including description, conditions, weather, participants, and associated routes.",
    inputSchema: getOutingSchema,
    handler: handleGetOuting,
  },
  {
    name: "search_outings",
    description:
      "Search outings (trip reports) across all of Camptocamp.org, most recent first (by end date, keyword searches included). All filters are optional and combine with AND: query (keyword), area_id (from search_areas), activity, date_from / date_to (YYYY-MM-DD; an outing matches if its date range overlaps the requested range — give one bound only for 'since' / 'until'), route_id (from search_routes), waypoint_id (from search_waypoints). Each result shows ID, title, activities, dates, condition rating, difficulty ratings, max elevation, elevation gain, mountain ranges and author. Use offset to page (offset + limit ≤ 10,000). An unknown area/route/waypoint ID yields no results, not an error. Call get_outing with an ID for the full conditions, weather and report text.",
    inputSchema: searchOutingsSchema,
    handler: handleSearchOutings,
  },
];
