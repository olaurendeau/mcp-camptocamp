import { z } from "zod";
import { searchWaypoints, getWaypoint } from "../api/camptocamp.js";
import type { WaypointSearchResponse, WaypointDetail } from "../api/camptocamp.js";

export const searchWaypointsSchema = z.object({
  query: z.string().describe("Search query for waypoints (e.g. 'Mont Blanc', 'refuge Goûter')"),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
});

export const getWaypointSchema = z.object({
  id: z.number().int().positive().describe("Waypoint ID from Camptocamp"),
});

export type SearchWaypointsInput = z.infer<typeof searchWaypointsSchema>;
export type GetWaypointInput = z.infer<typeof getWaypointSchema>;

function formatWaypointSearchResult(response: WaypointSearchResponse): string {
  if (response.documents.length === 0) {
    return "No waypoints found.";
  }

  const lines: string[] = [`Found ${response.total} waypoint(s). Showing ${response.documents.length}:\n`];

  for (const wp of response.documents) {
    const locale = wp.locales.find((l) => l.lang === "fr") ?? wp.locales[0];
    const title = locale?.title ?? "Untitled";
    const elevation = wp.elevation ? ` | ${wp.elevation}m` : "";

    lines.push(`- [${wp.id}] ${title} (${wp.waypoint_type})${elevation}`);
  }

  return lines.join("\n");
}

function formatWaypointDetail(waypoint: WaypointDetail): string {
  const locale = waypoint.locales.find((l) => l.lang === "fr") ?? waypoint.locales[0];
  const lines: string[] = [];

  lines.push(`# ${locale?.title ?? "Untitled"} (ID: ${waypoint.id})`);
  lines.push(`\n**Type**: ${waypoint.waypoint_type}`);

  if (waypoint.elevation) lines.push(`**Elevation**: ${waypoint.elevation}m`);

  if (waypoint.lat && waypoint.lng) {
    lines.push(`**Coordinates**: ${waypoint.lat}, ${waypoint.lng}`);
  }

  if (locale?.description) {
    lines.push(`\n## Description\n${locale.description}`);
  }

  if (locale?.access) {
    lines.push(`\n## Access\n${locale.access}`);
  }

  return lines.join("\n");
}

export async function handleSearchWaypoints(input: SearchWaypointsInput): Promise<string> {
  const response = await searchWaypoints(input.query, input.limit);
  return formatWaypointSearchResult(response);
}

export async function handleGetWaypoint(input: GetWaypointInput): Promise<string> {
  const waypoint = await getWaypoint(input.id);
  return formatWaypointDetail(waypoint);
}

export const waypointToolDefinitions = [
  {
    name: "search_waypoints",
    description:
      "Search for waypoints (summits, shelters, huts, bivouacs) on Camptocamp.org. Returns a list of matching waypoints with basic info (ID, title, type, elevation).",
    inputSchema: searchWaypointsSchema,
    handler: handleSearchWaypoints,
  },
  {
    name: "get_waypoint",
    description:
      "Get full details of a specific waypoint from Camptocamp.org by its ID, including altitude, GPS coordinates, and description.",
    inputSchema: getWaypointSchema,
    handler: handleGetWaypoint,
  },
];
