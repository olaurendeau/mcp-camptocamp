import { z } from "zod";
import { DETAIL_LANG_NOTE, LANG_NOTE, documentId, langInput, searchOffset, searchQuery } from "./inputs.js";
import { assertResultWindow, formatSearchPage, PAGING_NOTE, quote } from "./paging.js";
import { searchWaypoints, getWaypoint } from "../api/camptocamp.js";
import type { WaypointDetail } from "../api/camptocamp.js";
import {
  pickLocale,
  pickTitle,
  isPresent,
  isVirtualWaypoint,
  formatHeader,
  formatWaypointLine,
  formatAreasSection,
  formatRouteLine,
  formatBookLine,
  formatRecentOutings,
  formatListItems,
  formatLanguageLine,
} from "./format.js";
import { formatUserText, USER_TEXT_NOTE } from "./text.js";
import { CUSTODIANSHIPS, WAYPOINT_TYPES, enumValue } from "./enums.js";
import type { Lang } from "./enums.js";

export const searchWaypointsSchema = z.object({
  query: searchQuery("Search query for waypoints (e.g. 'Mont Blanc', 'refuge Goûter')", {
    allowBlank: true,
  }).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  offset: searchOffset(),
  lang: langInput(),
  area_id: documentId("Camptocamp area ID from search_areas (e.g. 14403 for Écrins)").optional(),
  waypoint_type: enumValue(WAYPOINT_TYPES)
    .optional()
    .describe(
      `Waypoint type, one of: ${WAYPOINT_TYPES.join(", ")} (hut = mountain hut, climbing_outdoor = crag, access = trailhead or parking). ` +
        "Narrows a query or area_id; not a filter on its own",
    ),
});

export const getWaypointSchema = z.object({
  id: documentId("Waypoint ID from Camptocamp"),
  lang: langInput(),
});

export type SearchWaypointsInput = z.infer<typeof searchWaypointsSchema>;
export type GetWaypointInput = z.infer<typeof getWaypointSchema>;

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

// capacity counts the places open outside the wardened period (a hut's winter room) and capacity_staffed
// the places when wardened, on huts, gîtes and camp sites alike; only a bivouac's capacity is just its number
// of places (c2c_ui src/translations/fr.json labels capacity "Nombre de places hors gardiennage", and
// "Nombre de places" in the bivouac context).
function formatHutLines(waypoint: WaypointDetail): string[] {
  const capacityLabel = waypoint.waypoint_type === "bivouac" ? "Capacity" : "Capacity (unstaffed)";
  const fields: Array<[string, string | number | null | undefined]> = [
    [capacityLabel, waypoint.capacity],
    ["Capacity (staffed)", waypoint.capacity_staffed],
    ["Custodianship", waypoint.custodianship],
    ["Phone", waypoint.phone],
    ["Custodian's phone", waypoint.phone_custodian],
    ["Website", waypoint.url],
  ];
  return fields.filter(([, value]) => isPresent(value)).map(([label, value]) => `**${label}**: ${value}`);
}

const VIRTUAL_WAYPOINT_NOTE =
  "Virtual waypoints (waypoint_type virtual) are groupings with no real location, so no elevation or coordinates are shown for them.";

const CUSTODIANSHIP_NOTE =
  "Custodianship is one of: " +
  Object.entries(CUSTODIANSHIPS)
    .map(([value, meaning]) => `${value} (${meaning})`)
    .join(", ") +
  "; any other value is printed as Camptocamp sends it.";

function formatWaypointDetail(waypoint: WaypointDetail, lang?: Lang): string {
  const locale = pickLocale(waypoint.locales, lang);
  const lines: string[] = [];

  lines.push(...formatHeader(pickTitle(waypoint.locales, lang), waypoint.document_id, "waypoints"));
  lines.push(...formatLanguageLine(waypoint.locales, lang));
  lines.push(`\n**Type**: ${waypoint.waypoint_type}`);

  // A virtual waypoint's elevation and position are placeholders (see isVirtualWaypoint).
  if (!isVirtualWaypoint(waypoint)) {
    if (isPresent(waypoint.elevation)) lines.push(`**Elevation**: ${waypoint.elevation}m`);

    const coords = parseCoordinates(waypoint.geometry?.geom);
    if (coords) {
      lines.push(`**Coordinates**: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
    }
  }

  lines.push(...formatHutLines(waypoint));

  lines.push(...formatAreasSection(waypoint.areas, lang));

  lines.push(...formatUserText("summary", "Summary", locale?.summary));
  lines.push(...formatUserText("description", "Description", locale?.description));
  lines.push(...formatUserText("access", "Access", locale?.access));
  lines.push(...formatUserText("access_period", "Access period", locale?.access_period));

  lines.push(...formatWaypointAssociations(waypoint, lang));

  return lines.join("\n");
}

// A crag can have hundreds of routes (~40 KB); the rest are one search_routes call away (decision Q2 on #58).
const MAX_ROUTES = 50;

// The routes, books and recent outings of a waypoint. An empty or missing list prints no section.
function formatWaypointAssociations(waypoint: WaypointDetail, lang?: Lang): string[] {
  const associations = waypoint.associations;
  const lines: string[] = [];

  const routes = associations?.all_routes;
  if (routes && routes.documents.length > 0) {
    const shown = routes.documents.slice(0, MAX_ROUTES);
    lines.push(
      `\n## Routes (${shown.length} of ${routes.total})`,
      ...formatListItems(shown, (route) => formatRouteLine(route, lang)),
    );
    if (routes.total > shown.length) lines.push(`More: search_routes with waypoint_id=${waypoint.document_id}`);
  }

  const books = associations?.books ?? [];
  if (books.length > 0) {
    lines.push("\n## Associated books", ...formatListItems(books, (book) => formatBookLine(book, lang)));
  }

  lines.push(
    ...formatRecentOutings(
      associations?.recent_outings,
      `search_outings with waypoint_id=${waypoint.document_id}`,
      lang,
    ),
  );
  return lines;
}

export async function handleSearchWaypoints(input: SearchWaypointsInput): Promise<string> {
  // A blank query counts as missing: the API treats `q=` like no `q` and returns the whole database.
  const query = input.query?.trim() ? input.query : undefined;
  if (query === undefined && input.area_id === undefined) {
    throw new Error("search_waypoints needs a query, an area_id, or both. Use search_areas to find an area_id.");
  }
  const { limit, offset, area_id, waypoint_type, lang } = input;
  assertResultWindow(offset, limit);

  const response = await searchWaypoints({ query, limit, offset, area_id, waypoint_type, lang });
  const filters: string[] = [];
  if (query !== undefined) filters.push(`query ${quote(query)}`);
  if (area_id !== undefined) filters.push(`area ${area_id}`);
  if (waypoint_type !== undefined) filters.push(`waypoint type ${waypoint_type}`);
  return formatSearchPage({
    kind: "waypoint",
    total: response.total,
    offset,
    limit,
    lines: formatListItems(response.documents, (waypoint) => formatWaypointLine(waypoint, { lang })),
    filters,
  });
}

export async function handleGetWaypoint(input: GetWaypointInput): Promise<string> {
  const waypoint = await getWaypoint(input.id);
  return formatWaypointDetail(waypoint, input.lang);
}

export const waypointToolDefinitions = [
  {
    name: "search_waypoints",
    title: "Search waypoints",
    description:
      "Search for waypoints (summits, shelters, huts, bivouacs) on Camptocamp.org by keyword, by area (area_id from search_areas), or both; at least one is required. waypoint_type narrows the search to one type (e.g. hut, summit, climbing_outdoor). Returns a list of matching waypoints with basic info (ID, title, type, elevation), after a header giving the total, the offset and the filters. " +
      VIRTUAL_WAYPOINT_NOTE +
      " " +
      `${PAGING_NOTE} ${LANG_NOTE}`,
    inputSchema: searchWaypointsSchema,
    handler: handleSearchWaypoints,
  },
  {
    name: "get_waypoint",
    title: "Get waypoint details",
    description:
      "Get full details of a specific waypoint from Camptocamp.org by its ID, including altitude and GPS coordinates. " +
      VIRTUAL_WAYPOINT_NOTE +
      " It also gives capacity (for huts, gîtes and camp sites: places outside the wardened period, then places when wardened; for a bivouac: its number of places), custodianship, phones and website, summary, description, access, access period (free text, as written), the areas it belongs to (range, admin_limits, country), then its routes (at most 50, in search_routes format; a 'More: search_routes with waypoint_id=N' line follows when there are more), the books that cover it, and its most recent outings with their total ('More: search_outings with waypoint_id=N' lists them all). " +
      CUSTODIANSHIP_NOTE +
      " Area IDs can be passed as area_id to search_routes, search_waypoints and search_outings. The second line is the document's camptocamp.org URL, to cite as the source. " +
      `${LANG_NOTE} ${DETAIL_LANG_NOTE} ${USER_TEXT_NOTE}`,
    inputSchema: getWaypointSchema,
    handler: handleGetWaypoint,
  },
];
