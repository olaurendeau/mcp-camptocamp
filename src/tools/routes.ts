import { z } from "zod";
import { documentId, searchOffset, searchQuery } from "./inputs.js";
import { searchRoutes, getRoute } from "../api/camptocamp.js";
import type { RouteDetail, RouteRatingField, RouteSearchOptions } from "../api/camptocamp.js";
import {
  pickLocale,
  isPresent,
  formatHeader,
  formatRouteName,
  formatRouteLine,
  formatAreasSection,
  formatAssociatedRouteLine,
  formatWaypointLine,
  formatBookLine,
  formatTitledLine,
  formatRecentOutings,
  formatListItems,
} from "./format.js";
import { ROUTE_RATING_SYSTEMS, formatRatingLines } from "./ratings.js";
import { formatUserText, USER_TEXT_NOTE } from "./text.js";
import { ACTIVITIES, ROUTE_CONFIGURATIONS, ROUTE_TYPES, enumValue } from "./enums.js";
import { assertResultWindow, formatSearchPage, quote } from "./paging.js";
import { describeRange, heightDiffUp, rangeFilter, ratingBound, ratingFilter, ratingScales } from "./filters.js";

const RATING_SYSTEM_NAMES = Object.keys(ROUTE_RATING_SYSTEMS) as [RouteRatingField, ...RouteRatingField[]];

const RATING_SCALES = ratingScales(RATING_SYSTEM_NAMES);

// A list filter: one value or more, every one from `values`; the API matches routes having any of them.
function enumList<T extends string>(values: readonly [T, ...T[]], description: string) {
  return z.array(enumValue(values)).min(1).optional().describe(description);
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
  height_diff_up_min: heightDiffUp("Lowest", "routes"),
  height_diff_up_max: heightDiffUp("Highest", "routes"),
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

// The options for searchRoutes, after every check that needs more than one field; only given filters are set.
function routeSearchOptions(input: SearchRoutesInput): RouteSearchOptions {
  const rating = ratingFilter(input, RATING_SYSTEM_NAMES);
  const heightDiff = rangeFilter(input.height_diff_up_min, input.height_diff_up_max, [
    "height_diff_up_min",
    "height_diff_up_max",
  ]);
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
  if (options.query !== undefined) filters.push(`query ${quote(options.query)}`);
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

// The documents linked to a route, so that one get_route call gives the books covering it (#58, S3).
// An empty or missing list prints no section.
function formatRouteAssociations(route: RouteDetail): string[] {
  const associations = route.associations;
  const lines: string[] = [];
  const section = (heading: string, items: string[] = []): void => {
    if (items.length > 0) lines.push(`\n## ${heading}`, ...items);
  };

  section(
    "Associated waypoints",
    // formatWaypointLine prints a malformed waypoint's placeholder itself, so a malformed main waypoint keeps
    // its marker; a placeholder without a readable ID is never the main waypoint.
    (associations?.waypoints ?? []).map((waypoint) =>
      formatWaypointLine(waypoint, {
        main: waypoint.document_id !== undefined && waypoint.document_id === route.main_waypoint_id,
      }),
    ),
  );
  section("Associated routes", formatListItems(associations?.routes ?? [], formatAssociatedRouteLine));
  section("Associated books", formatListItems(associations?.books ?? [], formatBookLine));
  section("Associated articles", formatListItems(associations?.articles ?? [], formatTitledLine));
  lines.push(...formatRecentOutings(associations?.recent_outings, `search_outings with route_id=${route.document_id}`));
  return lines;
}

// The practical facts of a route (#58, S7), each line left out when absent (R1: 0 and false are printed).
// Values are printed verbatim (R2): enum codes untranslated, lists comma-separated.
function formatRouteFacts(route: RouteDetail): string[] {
  const lines: string[] = [];
  const list = (label: string, values: string[] | null | undefined): void => {
    if (isPresent(values)) lines.push(`**${label}**: ${values.join(", ")}`);
  };

  if (isPresent(route.height_diff_difficulties)) {
    lines.push(`**Difficulties height difference**: ${route.height_diff_difficulties}m`);
  }
  if (isPresent(route.height_diff_access)) lines.push(`**Access height difference**: ${route.height_diff_access}m`);
  list("Orientations", route.orientations);
  list("Duration (days)", route.durations);
  list("Route types", route.route_types);
  list("Configuration", route.configuration);
  if (isPresent(route.glacier_gear)) lines.push(`**Glacier gear**: ${route.glacier_gear}`);
  if (isPresent(route.lift_access)) lines.push(`**Lift access**: ${route.lift_access ? "yes" : "no"}`);
  return lines;
}

function formatRouteDetail(route: RouteDetail): string {
  const locale = pickLocale(route.locales);
  const lines: string[] = [];

  lines.push(...formatHeader(formatRouteName(locale), route.document_id, "routes"));
  lines.push(`\n**Activities**: ${route.activities.join(", ")}`);

  lines.push(...formatRatingLines(route));

  if (isPresent(route.elevation_max)) lines.push(`**Max elevation**: ${route.elevation_max}m`);
  if (isPresent(route.elevation_min)) lines.push(`**Min elevation**: ${route.elevation_min}m`);
  if (isPresent(route.height_diff_up)) lines.push(`**Elevation gain**: ${route.height_diff_up}m`);
  if (isPresent(route.height_diff_down)) lines.push(`**Elevation loss**: ${route.height_diff_down}m`);
  lines.push(...formatRouteFacts(route));

  lines.push(...formatAreasSection(route.areas));

  lines.push(...formatUserText("summary", "Summary", locale?.summary));
  lines.push(...formatUserText("description", "Description", locale?.description));
  lines.push(...formatUserText("slope", "Slope", locale?.slope));
  lines.push(...formatUserText("remarks", "Remarks", locale?.remarks));
  lines.push(...formatUserText("gear", "Gear", locale?.gear));
  lines.push(...formatUserText("route_history", "Route history", locale?.route_history));
  lines.push(...formatUserText("external_resources", "External resources", locale?.external_resources));

  lines.push(...formatRouteAssociations(route));

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
    lines: formatListItems(response.documents, formatRouteLine),
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
      "Get full details of a specific route from Camptocamp.org by its ID, headed by its name ('<summit> : <route title>'), including every rating labelled by its grading system (Toponeige ski rating, Labande, global rating, rock, ice, hiking…), elevation data, practical facts printed as Camptocamp's codes (orientations, duration in days, route types, configuration, glacier gear, difficulties and access height differences, lift access yes/no), its summary, description, slope, remarks, gear, route history and external resources, and the areas it belongs to (range, admin_limits, country). Area IDs can be passed as area_id to search_routes, search_waypoints and search_outings. It also lists, with their IDs, the guidebooks and other books that cover it, its waypoints (the main one marked), sibling routes, related articles, and its most recent outings ('Recent outings (<shown> of <total>)'; list them all with search_outings with route_id). The second line is the document's camptocamp.org URL, to cite as the source. " +
      USER_TEXT_NOTE,
    inputSchema: getRouteSchema,
    handler: handleGetRoute,
  },
];
