import { z } from "zod";
import { documentId, searchQuery } from "./inputs.js";
import { searchWaypoints, getWaypoint } from "../api/camptocamp.js";
import type { WaypointSearchResponse, WaypointDetail } from "../api/camptocamp.js";
import { pickLocale, pickTitle, formatHeader, formatAreasSection } from "./format.js";
import { formatUserText, USER_TEXT_NOTE } from "./text.js";

export const searchWaypointsSchema = z.object({
  query: searchQuery("Search query for waypoints (e.g. 'Mont Blanc', 'refuge Goûter')", {
    allowBlank: true,
  }).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  area_id: documentId("Camptocamp area ID from search_areas (e.g. 14403 for Écrins)").optional(),
});

export const getWaypointSchema = z.object({
  id: documentId("Waypoint ID from Camptocamp"),
});

export type SearchWaypointsInput = z.infer<typeof searchWaypointsSchema>;
export type GetWaypointInput = z.infer<typeof getWaypointSchema>;

function formatWaypointSearchResult(response: WaypointSearchResponse, areaId?: number): string {
  const scope = areaId !== undefined ? ` in area ${areaId}` : "";
  if (response.documents.length === 0) {
    return `No waypoints found${scope}.`;
  }

  const lines: string[] = [`Found ${response.total} waypoint(s)${scope}. Showing ${response.documents.length}:\n`];

  for (const wp of response.documents) {
    const title = pickTitle(wp.locales);
    const elevation = wp.elevation ? ` | ${wp.elevation}m` : "";

    lines.push(`- [${wp.document_id}] ${title} (${wp.waypoint_type})${elevation}`);
  }

  return lines.join("\n");
}

// geometry.geom is a GeoJSON Point serialized as a string, in Web Mercator (EPSG:3857)
function parseCoordinates(geom?: string | null): { lat: number; lng: number } | undefined {
  if (!geom) return undefined;
  try {
    const parsed = JSON.parse(geom) as { coordinates?: [number, number] };
    if (!Array.isArray(parsed.coordinates)) return undefined;
    const [x, y] = parsed.coordinates;
    const R = 6378137;
    const lng = (x / R) * (180 / Math.PI);
    const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
    return { lat, lng };
  } catch {
    return undefined;
  }
}

function formatWaypointDetail(waypoint: WaypointDetail): string {
  const locale = pickLocale(waypoint.locales);
  const lines: string[] = [];

  lines.push(...formatHeader(pickTitle(waypoint.locales), waypoint.document_id, "waypoints"));
  lines.push(`\n**Type**: ${waypoint.waypoint_type}`);

  if (waypoint.elevation) lines.push(`**Elevation**: ${waypoint.elevation}m`);

  const coords = parseCoordinates(waypoint.geometry?.geom);
  if (coords) {
    lines.push(`**Coordinates**: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
  }

  lines.push(...formatAreasSection(waypoint.areas));

  lines.push(...formatUserText("description", "Description", locale?.description));
  lines.push(...formatUserText("access", "Access", locale?.access));

  return lines.join("\n");
}

export async function handleSearchWaypoints(input: SearchWaypointsInput): Promise<string> {
  // A blank query counts as missing: the API treats `q=` like no `q` and returns the whole database.
  const query = input.query?.trim() ? input.query : undefined;
  if (query === undefined && input.area_id === undefined) {
    throw new Error("search_waypoints needs a query, an area_id, or both. Use search_areas to find an area_id.");
  }
  const response = await searchWaypoints({ query, limit: input.limit, area_id: input.area_id });
  return formatWaypointSearchResult(response, input.area_id);
}

export async function handleGetWaypoint(input: GetWaypointInput): Promise<string> {
  const waypoint = await getWaypoint(input.id);
  return formatWaypointDetail(waypoint);
}

export const waypointToolDefinitions = [
  {
    name: "search_waypoints",
    title: "Search waypoints",
    description:
      "Search for waypoints (summits, shelters, huts, bivouacs) on Camptocamp.org by keyword, by area (area_id from search_areas), or both; at least one is required. Returns a list of matching waypoints with basic info (ID, title, type, elevation).",
    inputSchema: searchWaypointsSchema,
    handler: handleSearchWaypoints,
  },
  {
    name: "get_waypoint",
    title: "Get waypoint details",
    description:
      "Get full details of a specific waypoint from Camptocamp.org by its ID, including altitude, GPS coordinates, description, and the areas it belongs to (range, admin_limits, country). Area IDs can be passed as area_id to search_routes, search_waypoints and search_outings. The second line is the document's camptocamp.org URL, to cite as the source. " +
      USER_TEXT_NOTE,
    inputSchema: getWaypointSchema,
    handler: handleGetWaypoint,
  },
];
