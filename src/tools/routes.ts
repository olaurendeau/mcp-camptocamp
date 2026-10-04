import { z } from "zod";
import { documentId, searchQuery } from "./inputs.js";
import { searchRoutes, getRoute } from "../api/camptocamp.js";
import type { RouteSearchResponse, RouteDetail } from "../api/camptocamp.js";
import { pickLocale, isPresent, formatHeader, formatRouteName, formatRouteLine, formatAreasSection } from "./format.js";
import { formatRatingLines } from "./ratings.js";
import { formatUserText, USER_TEXT_NOTE } from "./text.js";

export const searchRoutesSchema = z.object({
  query: searchQuery("Search query for routes (e.g. 'Mont Blanc voie normale')", { allowBlank: true }).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  area_id: documentId("Camptocamp area ID from search_areas (e.g. 14403 for Écrins)").optional(),
});

export const getRouteSchema = z.object({
  id: documentId("Route ID from Camptocamp"),
});

export type SearchRoutesInput = z.infer<typeof searchRoutesSchema>;
export type GetRouteInput = z.infer<typeof getRouteSchema>;

function formatRouteSearchResult(response: RouteSearchResponse, areaId?: number): string {
  const scope = areaId !== undefined ? ` in area ${areaId}` : "";
  if (response.documents.length === 0) {
    return `No routes found${scope}.`;
  }

  const lines: string[] = [`Found ${response.total} route(s)${scope}. Showing ${response.documents.length}:\n`];

  lines.push(...response.documents.map(formatRouteLine));
  return lines.join("\n");
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

  lines.push(...formatAreasSection(route.areas));

  lines.push(...formatUserText("description", "Description", locale?.description));
  lines.push(...formatUserText("remarks", "Remarks", locale?.remarks));
  lines.push(...formatUserText("gear", "Gear", locale?.gear));

  return lines.join("\n");
}

export async function handleSearchRoutes(input: SearchRoutesInput): Promise<string> {
  // A blank query counts as missing: the API treats `q=` like no `q` and returns the whole database.
  const query = input.query?.trim() ? input.query : undefined;
  if (query === undefined && input.area_id === undefined) {
    throw new Error("search_routes needs a query, an area_id, or both. Use search_areas to find an area_id.");
  }
  const response = await searchRoutes({ query, limit: input.limit, area_id: input.area_id });
  return formatRouteSearchResult(response, input.area_id);
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
      "Search for mountain routes on Camptocamp.org by keyword, by area (area_id from search_areas), or both; at least one is required. Returns a list of matching routes with basic info (ID, name as '<summit> : <route title>', activities, max elevation, elevation gain, and every rating labelled by its grading system, e.g. 'Ski rating (Toponeige): 4.1 | Labande: S4 / AD | Global rating: F').",
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
