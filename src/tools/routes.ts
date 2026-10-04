import { z } from "zod";
import { documentId, searchOffset, searchQuery } from "./inputs.js";
import { searchRoutes, getRoute } from "../api/camptocamp.js";
import type { RouteDetail, RouteRatingField, RouteSearchOptions } from "../api/camptocamp.js";
import { pickLocale, formatHeader, formatRouteName, formatRouteLine, formatAreasSection } from "./format.js";
import { ROUTE_RATING_SYSTEMS, formatRatingLines } from "./ratings.js";
import { formatUserText, USER_TEXT_NOTE } from "./text.js";
import { ACTIVITIES, ROUTE_CONFIGURATIONS, ROUTE_TYPES, enumValue } from "./enums.js";
import { assertResultWindow, formatSearchPage } from "./paging.js";

const RATING_SYSTEM_NAMES = Object.keys(ROUTE_RATING_SYSTEMS) as [RouteRatingField, ...RouteRatingField[]];

const RATING_SCALES = Object.entries(ROUTE_RATING_SYSTEMS)
  .map(([field, { scale }]) => `${field}: ${scale.join(", ")}`)
  .join("; ");

// A list filter: one value or more, every one from `values`; the API matches routes having any of them.
function enumList<T extends string>(values: readonly [T, ...T[]], description: string) {
  return z.array(enumValue(values)).min(1).optional().describe(description);
}

// The longest scale value is 4 characters ("M12+"); the cap keeps an invalid value short in the error that echoes it.
const MAX_RATING_LENGTH = 8;

function ratingBound(description: string) {
  return z.string().max(MAX_RATING_LENGTH).optional().describe(description);
}

function heightDiffUp(bound: string) {
  return z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(`${bound} elevation gain in metres, inclusive (routes without an elevation gain are excluded)`);
}

export const searchRoutesSchema = z.object({
  query: searchQuery("Search query for routes (e.g. 'Mont Blanc voie normale')", { allowBlank: true }).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  area_id: documentId("Camptocamp area ID from search_areas (e.g. 14403 for Écrins)").optional(),
  waypoint_id: documentId(
    "Camptocamp waypoint ID from search_waypoints: routes associated with this summit, hut, crag… (e.g. 37916 for Mont Pourri)",
  ).optional(),
  activity: enumValue(ACTIVITIES)
    .optional()
    .describe(`Activity, one of: ${ACTIVITIES.join(", ")}`),
  rating_system: enumValue(RATING_SYSTEM_NAMES)
    .optional()
    .describe(
      "Rating system to filter on, with rating_min and/or rating_max (inclusive bounds, one system per call; " +
        `ski_rating is the Toponeige ski rating). Valid values per system, easiest first: ${RATING_SCALES}. ` +
        "Routes without a value for the chosen rating are excluded.",
    ),
  rating_min: ratingBound("Easiest rating to include, from the scale of rating_system (e.g. '3.1' for ski_rating)"),
  rating_max: ratingBound("Hardest rating to include, from the scale of rating_system (e.g. 'AD' for global_rating)"),
  height_diff_up_min: heightDiffUp("Lowest"),
  height_diff_up_max: heightDiffUp("Highest"),
  route_types: enumList(ROUTE_TYPES, `Route types, matching any of: ${ROUTE_TYPES.join(", ")}`),
  configuration: enumList(
    ROUTE_CONFIGURATIONS,
    `Terrain configurations, matching any of: ${ROUTE_CONFIGURATIONS.join(", ")} (edge = arête/ridge)`,
  ),
  offset: searchOffset(),
});

export const getRouteSchema = z.object({
  id: documentId("Route ID from Camptocamp"),
});

export type SearchRoutesInput = z.infer<typeof searchRoutesSchema>;
export type GetRouteInput = z.infer<typeof getRouteSchema>;

// "3.1 → 4.1", "from 3.1" or "up to 4.1".
function describeRange(min: string | number | undefined, max: string | number | undefined, unit = ""): string {
  if (min !== undefined && max !== undefined) return `${min} → ${max}${unit}`;
  return min !== undefined ? `from ${min}${unit}` : `up to ${max}${unit}`;
}

// R7: the API ignores an off-scale bound (`grat=XX` returns every route), so check both before any request.
function ratingFilter(input: SearchRoutesInput): RouteSearchOptions["rating"] {
  const { rating_system: system, rating_min: min, rating_max: max } = input;
  if (system === undefined) {
    if (min !== undefined || max !== undefined) {
      throw new Error(`rating_min and rating_max need a rating_system, one of: ${RATING_SYSTEM_NAMES.join(", ")}`);
    }
    return undefined;
  }
  if (min === undefined && max === undefined) {
    throw new Error("rating_system needs rating_min, rating_max or both");
  }

  const { scale } = ROUTE_RATING_SYSTEMS[system];
  for (const [name, value] of [
    ["rating_min", min],
    ["rating_max", max],
  ] as const) {
    if (value !== undefined && !scale.includes(value)) {
      throw new Error(`${name} "${value}" is not a valid ${system} value; valid values: ${scale.join(", ")}`);
    }
  }
  if (min !== undefined && max !== undefined && scale.indexOf(min) > scale.indexOf(max)) {
    throw new Error("rating_min must not be above rating_max");
  }
  return { system, ...(min !== undefined && { min }), ...(max !== undefined && { max }) };
}

function heightDiffUpFilter(input: SearchRoutesInput): RouteSearchOptions["height_diff_up"] {
  const { height_diff_up_min: min, height_diff_up_max: max } = input;
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error("height_diff_up_min must not be above height_diff_up_max");
  }
  if (min === undefined && max === undefined) return undefined;
  return { ...(min !== undefined && { min }), ...(max !== undefined && { max }) };
}

// The options for searchRoutes, after every check that needs more than one field; only given filters are set.
function routeSearchOptions(input: SearchRoutesInput): RouteSearchOptions {
  const rating = ratingFilter(input);
  const heightDiff = heightDiffUpFilter(input);
  // A blank query counts as missing: the API treats `q=` like no `q` and returns the whole database.
  const query = input.query?.trim() ? input.query : undefined;
  const filters: Omit<RouteSearchOptions, "limit" | "offset"> = {
    ...(query !== undefined && { query }),
    ...(input.area_id !== undefined && { area_id: input.area_id }),
    ...(input.waypoint_id !== undefined && { waypoint_id: input.waypoint_id }),
    ...(input.activity !== undefined && { activity: input.activity }),
    ...(rating !== undefined && { rating }),
    ...(heightDiff !== undefined && { height_diff_up: heightDiff }),
    ...(input.route_types !== undefined && { route_types: input.route_types }),
    ...(input.configuration !== undefined && { configuration: input.configuration }),
  };
  // D5 on #58: any single filter is enough; a call without one would list the whole database.
  if (Object.keys(filters).length === 0) {
    throw new Error(
      "search_routes needs at least one filter: query, area_id, waypoint_id, activity, rating_system, " +
        "height_diff_up_min/max, route_types or configuration. Use search_areas to find an area_id.",
    );
  }
  assertResultWindow(input.offset, input.limit);
  return { ...filters, limit: input.limit, offset: input.offset };
}

// The Filters line, in the order of the inputs: `area 14409, activity skitouring, ski rating (Toponeige) 3.1 → 4.1`.
function describeFilters(options: RouteSearchOptions): string[] {
  const filters: string[] = [];
  if (options.query !== undefined) filters.push(`query "${options.query}"`);
  if (options.area_id !== undefined) filters.push(`area ${options.area_id}`);
  if (options.waypoint_id !== undefined) filters.push(`waypoint ${options.waypoint_id}`);
  if (options.activity !== undefined) filters.push(`activity ${options.activity}`);
  if (options.rating !== undefined) {
    const { system, min, max } = options.rating;
    filters.push(`${ROUTE_RATING_SYSTEMS[system].label} ${describeRange(min, max)}`);
  }
  if (options.height_diff_up !== undefined) {
    filters.push(`elevation gain ${describeRange(options.height_diff_up.min, options.height_diff_up.max, "m")}`);
  }
  if (options.route_types !== undefined) filters.push(`route types ${options.route_types.join(" or ")}`);
  if (options.configuration !== undefined) filters.push(`configuration ${options.configuration.join(" or ")}`);
  return filters;
}

function formatRouteDetail(route: RouteDetail): string {
  const locale = pickLocale(route.locales);
  const lines: string[] = [];

  lines.push(...formatHeader(formatRouteName(locale), route.document_id, "routes"));
  lines.push(`\n**Activities**: ${route.activities.join(", ")}`);

  lines.push(...formatRatingLines(route));

  if (route.elevation_max) lines.push(`**Max elevation**: ${route.elevation_max}m`);
  if (route.elevation_min) lines.push(`**Min elevation**: ${route.elevation_min}m`);
  if (route.height_diff_up) lines.push(`**Elevation gain**: ${route.height_diff_up}m`);
  if (route.height_diff_down) lines.push(`**Elevation loss**: ${route.height_diff_down}m`);

  lines.push(...formatAreasSection(route.areas));

  lines.push(...formatUserText("description", "Description", locale?.description));
  lines.push(...formatUserText("remarks", "Remarks", locale?.remarks));
  lines.push(...formatUserText("gear", "Gear", locale?.gear));

  return lines.join("\n");
}

// The SDK has already validated `input` against searchRoutesSchema and applied its defaults.
export async function handleSearchRoutes(input: SearchRoutesInput): Promise<string> {
  const options = routeSearchOptions(input);
  const response = await searchRoutes(options);
  return formatSearchPage({
    kind: "route",
    total: response.total,
    offset: input.offset,
    limit: input.limit,
    lines: response.documents.map(formatRouteLine),
    filters: describeFilters(options),
  });
}

export async function handleGetRoute(input: GetRouteInput): Promise<string> {
  const route = await getRoute(input.id);
  return formatRouteDetail(route);
}

export const routeToolDefinitions = [
  {
    name: "search_routes",
    title: "Search routes",
    description:
      "Search for mountain routes on Camptocamp.org. Filters combine with AND and at least one filter is required (any single one is enough): query (keyword), area_id (from search_areas), waypoint_id (routes of a summit, hut or crag, from search_waypoints), activity, rating_system with rating_min and/or rating_max (one grading system per call, inclusive bounds checked against its scale; routes without that rating are excluded), height_diff_up_min / height_diff_up_max (elevation gain in metres, inclusive), route_types and configuration (each matches any of the listed values). Returns matching routes with basic info (ID, name as '<summit> : <route title>', activities, max elevation, elevation gain, and every rating labelled by its grading system, e.g. 'Ski rating (Toponeige): 4.1 | Labande: S4 / AD | Global rating: F'); the header repeats the applied filters. Use offset to page (offset + limit ≤ 10,000): the output ends with 'Next page: offset=N' when more routes follow, or says when they lie beyond Camptocamp's 10,000-result window. An unknown area or waypoint ID yields no results, not an error. Call get_route with an ID for the full description.",
    inputSchema: searchRoutesSchema,
    handler: handleSearchRoutes,
  },
  {
    name: "get_route",
    title: "Get route details",
    description:
      "Get full details of a specific route from Camptocamp.org by its ID, headed by its name ('<summit> : <route title>'), including description, every rating labelled by its grading system (Toponeige ski rating, Labande, global rating, rock, ice, hiking…), elevation data, gear requirements, and the areas it belongs to (range, admin_limits, country). Area IDs can be passed as area_id to search_routes, search_waypoints and search_outings. The second line is the document's camptocamp.org URL, to cite as the source. " +
      USER_TEXT_NOTE,
    inputSchema: getRouteSchema,
    handler: handleGetRoute,
  },
];
