import { z } from "zod";
import { documentId, searchQuery } from "./inputs.js";
import { searchRoutes, getRoute } from "../api/camptocamp.js";
import type { RouteSearchResponse, RouteDetail } from "../api/camptocamp.js";
import { pickLocale, formatHeader, formatRouteName, formatAreasSection } from "./format.js";

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

  for (const route of response.documents) {
    const name = formatRouteName(pickLocale(route.locales));
    const activities = route.activities.join(", ");
    const elevation = route.elevation_max ? ` | Max elevation: ${route.elevation_max}m` : "";
    const rating = route.global_rating ? ` | Rating: ${route.global_rating}` : "";

    lines.push(`- [${route.document_id}] ${name} (${activities})${elevation}${rating}`);
  }

  return lines.join("\n");
}

function formatRouteDetail(route: RouteDetail): string {
  const locale = pickLocale(route.locales);
  const lines: string[] = [];

  lines.push(...formatHeader(formatRouteName(locale), route.document_id, "routes"));
  lines.push(`\n**Activities**: ${route.activities.join(", ")}`);

  if (route.global_rating) lines.push(`**Global rating**: ${route.global_rating}`);
  if (route.rock_free_rating) lines.push(`**Rock free rating**: ${route.rock_free_rating}`);
  if (route.engagement_rating) lines.push(`**Engagement**: ${route.engagement_rating}`);
  if (route.equipment_rating) lines.push(`**Equipment**: ${route.equipment_rating}`);

  if (route.elevation_max) lines.push(`**Max elevation**: ${route.elevation_max}m`);
  if (route.elevation_min) lines.push(`**Min elevation**: ${route.elevation_min}m`);
  if (route.height_diff_up) lines.push(`**Elevation gain**: ${route.height_diff_up}m`);
  if (route.height_diff_down) lines.push(`**Elevation loss**: ${route.height_diff_down}m`);

  lines.push(...formatAreasSection(route.areas));

  if (locale?.description) {
    lines.push(`\n## Description\n${locale.description}`);
  }

  if (locale?.remarks) {
    lines.push(`\n## Remarks\n${locale.remarks}`);
  }

  if (locale?.gear) {
    lines.push(`\n## Gear\n${locale.gear}`);
  }

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
      "Search for mountain routes on Camptocamp.org by keyword, by area (area_id from search_areas), or both; at least one is required. Returns a list of matching routes with basic info (ID, name as '<summit> : <route title>', activities, elevation, rating).",
    inputSchema: searchRoutesSchema,
    handler: handleSearchRoutes,
  },
  {
    name: "get_route",
    title: "Get route details",
    description:
      "Get full details of a specific route from Camptocamp.org by its ID, headed by its name ('<summit> : <route title>'), including description, ratings, elevation data, gear requirements, and the areas it belongs to (range, admin_limits, country). Area IDs can be passed as area_id to search_routes, search_waypoints and search_outings. The second line is the document's camptocamp.org URL, to cite as the source.",
    inputSchema: getRouteSchema,
    handler: handleGetRoute,
  },
];
