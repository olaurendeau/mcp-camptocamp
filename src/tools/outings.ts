import { z } from "zod";
import { DETAIL_LANG_NOTE, LANG_NOTE, documentId, langInput, searchOffset, searchQuery } from "./inputs.js";
import { assertResultWindow, formatSearchPage, quote } from "./paging.js";
import { ACTIVITIES, enumValue } from "./enums.js";
import type { Lang } from "./enums.js";
import { getOuting, searchOutings } from "../api/camptocamp.js";
import { CONDITION_RATINGS, OUTING_RATING_FIELDS } from "../api/values.js";
import type { OutingDetail, OutingListResponse, OutingSearchParams } from "../api/camptocamp.js";
import {
  pickLocale,
  pickTitle,
  isPresent,
  formatDateRange,
  formatHeader,
  formatAssociatedRouteLine,
  formatOutingLine,
  formatListItems,
  formatMalformed,
  formatLanguageLine,
  formatOtherLanguagesLine,
  MALFORMED_ITEM_NOTE,
} from "./format.js";
import { isMalformed } from "../api/schemas.js";
import { ROUTE_RATING_SYSTEMS, formatRatingLines } from "./ratings.js";
import { describeRange, heightDiffUp, rangeFilter, ratingBound, ratingFilter, ratingScales } from "./filters.js";
import { formatUserTexts, USER_TEXT_NOTE, type TextSection } from "./text.js";

// The free-text sections get_outing prints, in print order; a field name the locale lacks fails the typecheck.
const OUTING_TEXT = [
  ["description", "Description"],
  ["route_description", "Route description"],
  ["conditions", "Conditions"],
  ["weather", "Weather"],
  ["timing", "Timing"],
  ["participants", "Participants"],
] as const satisfies readonly TextSection<keyof OutingDetail["locales"][number]>[];

export const getOutingSchema = z.object({
  id: documentId("Outing ID from Camptocamp"),
  lang: langInput(),
});

// The API answers 500 to impossible dates such as 2026-02-30, and ignores malformed ones.
function isRealDate(s: string): boolean {
  const date = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === s;
}

// Factories, not shared instances: a shared instance becomes a JSON Schema `$ref` to the first
// field using it, and strict clients then show that field's description for the others.
// The regex stays as the JSON Schema `pattern`; the real-date check only runs on a value that matches it,
// so that a malformed value reports one issue, not the same line twice.
const DATE_MESSAGE = "must be a real date in YYYY-MM-DD format";
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = () =>
  z
    .string()
    .regex(DATE_FORMAT, DATE_MESSAGE)
    .refine((s) => !DATE_FORMAT.test(s) || isRealDate(s), DATE_MESSAGE);

// A day of the year for `period`, checked in 2020 (a leap year), the year the API layer sends it in (01-01 aside).
const PERIOD_DAY_MESSAGE = "must be a real day in MM-DD format (e.g. 06-01; 02-29 allowed)";
const PERIOD_DAY_FORMAT = /^\d{2}-\d{2}$/;
const periodDay = () =>
  z
    .string()
    .regex(PERIOD_DAY_FORMAT, PERIOD_DAY_MESSAGE)
    .refine((s) => !PERIOD_DAY_FORMAT.test(s) || isRealDate(`2020-${s}`), PERIOD_DAY_MESSAGE);

function maxElevation(bound: string) {
  return z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(`${bound} max elevation reached in metres, inclusive (outings without a max elevation are excluded)`);
}

// On both bounds of each pair, moved from the search_outings description to keep it under 2048 characters (#211).
const DATE_RANGE_NOTE =
  "An outing matches if its date range overlaps the requested range; give one bound only for 'since' / 'until'.";
const PERIOD_LIMITS_NOTE =
  "A period cannot wrap around the new year, so make two calls for 12-20 → 01-10; " +
  "Camptocamp's period filter can miss outings on the first or last day of the range.";

export const searchOutingsSchema = z.object({
  query: searchQuery("Keyword matched against outing titles (e.g. 'cosmiques')", { allowBlank: true }).optional(),
  area_id: documentId("Camptocamp area ID from search_areas (e.g. 14409 for Vanoise)").optional(),
  activity: enumValue(ACTIVITIES)
    .optional()
    .describe(`Activity, one of: ${ACTIVITIES.join(", ")}`),
  rating_system: enumValue(OUTING_RATING_FIELDS)
    .optional()
    .describe(
      "Rating system to filter on, with rating_min and/or rating_max: the rating the outing's author reported for " +
        "that day (inclusive bounds, one system per call; ski_rating is the Toponeige ski rating). Valid values per " +
        `system, easiest first: ${ratingScales(OUTING_RATING_FIELDS)}. ` +
        "Outings without a value for the chosen rating are excluded.",
    ),
  rating_min: ratingBound("Easiest rating to include, from the scale of rating_system (e.g. '3.1' for ski_rating)"),
  rating_max: ratingBound("Hardest rating to include, from the scale of rating_system (e.g. 'AD' for global_rating)"),
  condition_at_least: enumValue(CONDITION_RATINGS)
    .optional()
    .describe(
      `Conditions the outing's author reported, this value or better; from best to worst: ${CONDITION_RATINGS.join(", ")} ` +
        "(outings without reported conditions are excluded)",
    ),
  max_elevation_min: maxElevation("Lowest"),
  max_elevation_max: maxElevation("Highest"),
  height_diff_up_min: heightDiffUp("Lowest", "outings"),
  height_diff_up_max: heightDiffUp("Highest", "outings"),
  date_from: isoDate()
    .optional()
    .describe(`Earliest date (YYYY-MM-DD); matches outings whose date range ends on or after it. ${DATE_RANGE_NOTE}`),
  date_to: isoDate()
    .optional()
    .describe(`Latest date (YYYY-MM-DD); matches outings whose date range starts on or before it. ${DATE_RANGE_NOTE}`),
  period_start: periodDay()
    .optional()
    .describe(
      `First day (MM-DD) of a period matched in every year; give period_end too (e.g. 06-01). ${PERIOD_LIMITS_NOTE}`,
    ),
  period_end: periodDay()
    .optional()
    .describe(
      `Last day (MM-DD) of a period matched in every year, on or after period_start (e.g. 06-30). ${PERIOD_LIMITS_NOTE}`,
    ),
  route_id: documentId("Camptocamp route ID from search_routes").optional(),
  waypoint_id: documentId("Camptocamp waypoint ID from search_waypoints").optional(),
  user_id: documentId(
    "Camptocamp user ID (the number in their profile URL): outings this user is listed on as a participant, not only those they wrote",
  ).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  offset: searchOffset(),
  lang: langInput(),
});

// search_user_outings: the user_id (required here), limit and offset of search_outings, nothing else.
export const searchUserOutingsSchema = searchOutingsSchema
  .pick({ user_id: true, limit: true, offset: true, lang: true })
  .required({ user_id: true });

export type SearchUserOutingsInput = z.infer<typeof searchUserOutingsSchema>;
export type GetOutingInput = z.infer<typeof getOutingSchema>;
export type SearchOutingsInput = z.infer<typeof searchOutingsSchema>;

// An account in the inline participants line. A malformed one keeps the "(user ID: N)" of the others, since
// "[N]" elsewhere is a document ID (review of #188); without a readable ID it is the bare placeholder.
function formatAccount(user: NonNullable<NonNullable<OutingDetail["associations"]>["users"]>[number]): string {
  if (!isMalformed(user)) return `${user.name} (user ID: ${user.document_id})`;
  return user.document_id === undefined
    ? formatMalformed(user)
    : `(user ID: ${user.document_id}, ${MALFORMED_ITEM_NOTE})`;
}

function formatOutingDetail(outing: OutingDetail, lang?: Lang): string {
  const locale = pickLocale(outing.locales, lang);
  const lines: string[] = [];

  lines.push(...formatHeader(pickTitle(outing.locales, lang), outing.document_id, "outings"));
  lines.push(...formatLanguageLine(outing.locales, lang));
  lines.push(...formatOtherLanguagesLine(outing.locales, locale, OUTING_TEXT));

  lines.push(`\n**Activities**: ${outing.activities.join(", ")}`);

  const date = formatDateRange(outing.date_start, outing.date_end);
  if (date) lines.push(`**Date**: ${date}`);
  if (isPresent(outing.participant_count)) lines.push(`**Participants**: ${outing.participant_count}`);
  const users = outing.associations?.users;
  if (users && users.length > 0) {
    lines.push(`**Participants with a Camptocamp account**: ${users.map(formatAccount).join(", ")}`);
  }

  lines.push(...formatRatingLines(outing));
  if (outing.condition_rating) lines.push(`**Conditions**: ${outing.condition_rating}`);

  if (isPresent(outing.elevation_max)) lines.push(`**Max elevation**: ${outing.elevation_max}m`);
  if (isPresent(outing.elevation_min)) lines.push(`**Min elevation**: ${outing.elevation_min}m`);
  if (isPresent(outing.height_diff_up)) lines.push(`**Elevation gain**: ${outing.height_diff_up}m`);
  if (isPresent(outing.height_diff_down)) lines.push(`**Elevation loss**: ${outing.height_diff_down}m`);

  lines.push(...formatUserTexts(locale, OUTING_TEXT));

  const routes = outing.associations?.routes;
  if (routes && routes.length > 0) {
    lines.push("\n## Associated routes", ...formatListItems(routes, (route) => formatAssociatedRouteLine(route, lang)));
  }

  return lines.join("\n");
}

// The Filters line: `area 14409, activity skitouring, ski rating (Toponeige) 3.1 → 4.1, conditions good or better`.
function describeFilters(params: OutingSearchParams): string[] {
  const filters: string[] = [];
  if (params.user_id !== undefined) filters.push(`user ${params.user_id}`);
  if (params.query !== undefined) filters.push(`query ${quote(params.query)}`);
  if (params.area_id !== undefined) filters.push(`area ${params.area_id}`);
  if (params.activity !== undefined) filters.push(`activity ${params.activity}`);
  if (params.rating !== undefined) {
    const { system, min, max } = params.rating;
    filters.push(`${ROUTE_RATING_SYSTEMS[system].label} ${describeRange(min, max)}`);
  }
  if (params.condition_at_least !== undefined) filters.push(`conditions ${params.condition_at_least} or better`);
  if (params.elevation_max !== undefined) {
    filters.push(`max elevation ${describeRange(params.elevation_max.min, params.elevation_max.max, "m")}`);
  }
  if (params.height_diff_up !== undefined) {
    filters.push(`elevation gain ${describeRange(params.height_diff_up.min, params.height_diff_up.max, "m")}`);
  }
  if (params.date_from !== undefined && params.date_to !== undefined) {
    filters.push(`dates ${params.date_from} → ${params.date_to}`);
  } else if (params.date_from !== undefined) {
    filters.push(`dates from ${params.date_from}`);
  } else if (params.date_to !== undefined) {
    filters.push(`dates until ${params.date_to}`);
  }
  if (params.period !== undefined) {
    filters.push(`period ${params.period.start} → ${params.period.end} of every year`);
  }
  if (params.route_id !== undefined) filters.push(`route ${params.route_id}`);
  if (params.waypoint_id !== undefined) filters.push(`waypoint ${params.waypoint_id}`);
  return filters;
}

// D1: the period is sent as given, so no outing outside it is shown, and the gap is stated.
// Camptocamp computes it with a 365.2425-day year, so a boundary day can drop out depending on the year.
const PERIOD_NOTE = "Note: Camptocamp's period filter can miss outings on the first or last day of the range.";

function formatOutingList(
  response: OutingListResponse,
  params: OutingSearchParams,
  { limit, offset }: Pick<SearchOutingsInput, "limit" | "offset">,
): string {
  return formatSearchPage({
    kind: "outing",
    total: response.total,
    offset,
    limit,
    lines: formatListItems(response.documents, (outing) => formatOutingLine(outing, params.lang)),
    filters: describeFilters(params),
    notes: params.period !== undefined ? [PERIOD_NOTE] : [],
    order: ", most recent first",
  });
}

// The period of the input, after the checks the schema cannot make on one field.
function periodFilter(start: string | undefined, end: string | undefined): OutingSearchParams["period"] {
  if ((start === undefined) !== (end === undefined)) {
    throw new Error("period_start and period_end must be given together (MM-DD, e.g. 06-01 and 06-30).");
  }
  if (start === undefined || end === undefined) return undefined;
  if (start > end) {
    // Camptocamp returns no outing at all for a wrapping period. The second call, starting on 01-01, works since
    // #251: the API layer sends a 01-01 start in a non-leap year.
    throw new Error(`period cannot wrap around the new year; make two calls (${start} → 12-31 and 01-01 → ${end})`);
  }
  return { start, end };
}

// The options for searchOutings, after every check that needs more than one field; only given filters are set.
function outingSearchParams(input: SearchOutingsInput): OutingSearchParams {
  const {
    query,
    rating_system,
    rating_min,
    rating_max,
    max_elevation_min,
    max_elevation_max,
    height_diff_up_min,
    height_diff_up_max,
    period_start,
    period_end,
    ...rest
  } = input;
  if (rest.date_from !== undefined && rest.date_to !== undefined && rest.date_from > rest.date_to) {
    throw new Error(`date_from (${rest.date_from}) must be on or before date_to (${rest.date_to}).`);
  }
  const period = periodFilter(period_start, period_end);
  // R7: the API ignores an off-scale bound and the 8 route systems it has no outing parameter for.
  const rating = ratingFilter({ rating_system, rating_min, rating_max }, OUTING_RATING_FIELDS);
  const elevationMax = rangeFilter(max_elevation_min, max_elevation_max, ["max_elevation_min", "max_elevation_max"]);
  const heightDiffUp = rangeFilter(height_diff_up_min, height_diff_up_max, [
    "height_diff_up_min",
    "height_diff_up_max",
  ]);
  assertResultWindow(rest.offset, rest.limit);
  return {
    // A blank query counts as missing: the API treats `q=` like no `q` and returns every outing.
    ...(query?.trim() ? { query } : {}),
    ...rest,
    ...(rating !== undefined && { rating }),
    ...(elevationMax !== undefined && { elevation_max: elevationMax }),
    ...(heightDiffUp !== undefined && { height_diff_up: heightDiffUp }),
    ...(period !== undefined && { period }),
  };
}

// The SDK has already validated `input` against searchOutingsSchema and applied its defaults.
export async function handleSearchOutings(input: SearchOutingsInput): Promise<string> {
  const params = outingSearchParams(input);
  const response = await searchOutings(params);
  return formatOutingList(response, params, input);
}

// AC5.6: a thin alias, so its output is exactly that of search_outings for the same user.
export async function handleSearchUserOutings(input: SearchUserOutingsInput): Promise<string> {
  return handleSearchOutings(input);
}

export async function handleGetOuting(input: GetOutingInput): Promise<string> {
  const outing = await getOuting(input.id);
  return formatOutingDetail(outing, input.lang);
}

export const outingToolDefinitions = [
  {
    name: "search_user_outings",
    title: "List a user's outings",
    description:
      "List a Camptocamp user's outings (trip reports), most recent first: outings this user is listed on as a participant, not only those they wrote. An alias of search_outings with only user_id (the number in the user's camptocamp.org profile URL), limit, offset and lang, returning exactly what search_outings returns for that user_id and lang. Each result shows ID, title, activities, dates, condition rating, max elevation, elevation gain, difficulty ratings labelled by grading system (e.g. 'Ski rating (Toponeige): 4.1 | Labande: AD | Global rating: F'), mountain ranges and author. Use offset to page (offset + limit ≤ 10,000): the output ends with 'Next page: offset=N' when more outings follow. To filter a user's outings by area, activity, rating, conditions, elevation, dates, period, route or waypoint, call search_outings with user_id. An unknown user ID yields no results, not an error. " +
      LANG_NOTE,
    inputSchema: searchUserOutingsSchema,
    handler: handleSearchUserOutings,
  },
  {
    name: "get_outing",
    title: "Get outing details",
    description:
      "Get full details of a specific outing (trip report) from Camptocamp.org by its ID, including every rating labelled by its grading system (e.g. 'Ski rating (Toponeige)', 'Labande', 'Global rating'), description, conditions, weather, participants, and associated routes (named '<summit> : <route title>', followed by their ratings). The second line is the document's camptocamp.org URL, to cite as the source. The outing detail does not carry its author: search_outings result lines end with 'Author: <name>'. 'Participants with a Camptocamp account' lists the Camptocamp accounts linked to the outing, with their user IDs. " +
      `${LANG_NOTE} ${DETAIL_LANG_NOTE} ${USER_TEXT_NOTE}`,
    inputSchema: getOutingSchema,
    handler: handleGetOuting,
  },
  {
    name: "search_outings",
    title: "Search outings",
    description:
      "Search outings (trip reports) across all of Camptocamp.org, most recent first (by end date, keyword searches included). All filters are optional and combine with AND: query (keyword), area_id (from search_areas), activity, rating_system with rating_min and/or rating_max (one of 12 grading systems per call, inclusive bounds checked against its scale), condition_at_least (that value or better), max_elevation_min / max_elevation_max and height_diff_up_min / height_diff_up_max (metres, inclusive) — the ratings and conditions the outing's author reported for that day, with the max elevation and elevation gain they reported; outings without a value for a chosen filter are excluded —, date_from / date_to (YYYY-MM-DD), period_start / period_end (MM-DD, both together; the same days in every year, e.g. 06-01 → 06-30 for all Junes; combine with date_from / date_to to limit the years), route_id (from search_routes), waypoint_id (from search_waypoints), user_id (outings this user is listed on as a participant, not only those they wrote). Each result shows ID, title, activities, dates, condition rating, max elevation, elevation gain, difficulty ratings labelled by grading system (e.g. 'Ski rating (Toponeige): 4.1 | Labande: AD | Global rating: F'), mountain ranges and author. Use offset to page (offset + limit ≤ 10,000): the output ends with 'Next page: offset=N' when more outings follow — or 'Next page: offset=N (limit at most M)' near the window's end, where limit must be lowered to M — or says when they lie beyond Camptocamp's 10,000-result window. An unknown area/route/waypoint/user ID yields no results, not an error. Call get_outing with an ID for the full conditions, weather and report text. " +
      LANG_NOTE,
    inputSchema: searchOutingsSchema,
    handler: handleSearchOutings,
  },
];
