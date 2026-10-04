import { z } from "zod";
import { documentId, searchOffset, searchQuery } from "./inputs.js";
import { assertResultWindow, formatSearchPage, PAGING_NOTE } from "./paging.js";
import { searchAreas, getArea } from "../api/camptocamp.js";
import type { AreaDetail } from "../api/camptocamp.js";
import { pickLocale, pickTitle, formatHeader, formatAreaLine } from "./format.js";
import { formatUserText, USER_TEXT_NOTE } from "./text.js";

export const searchAreasSchema = z.object({
  query: searchQuery("Area name in any language (e.g. 'Écrins', 'Valais', 'Wallis')", { allowBlank: false }),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  offset: searchOffset(),
  area_type: z
    .enum(["range", "admin_limits", "country"])
    .optional()
    .describe("Restrict to one area type: range, admin_limits or country"),
});

export const getAreaSchema = z.object({
  id: documentId("Area ID from Camptocamp"),
});

export type SearchAreasInput = z.infer<typeof searchAreasSchema>;
export type GetAreaInput = z.infer<typeof getAreaSchema>;

function formatAreaDetail(area: AreaDetail): string {
  const locale = pickLocale(area.locales);
  const lines: string[] = [];

  lines.push(...formatHeader(pickTitle(area.locales), area.document_id, "areas"));
  lines.push(`\n**Type**: ${area.area_type}`);

  lines.push(...formatUserText("summary", "Summary", locale?.summary));
  lines.push(...formatUserText("description", "Description", locale?.description));

  return lines.join("\n");
}

export async function handleSearchAreas(input: SearchAreasInput): Promise<string> {
  const { query, limit, offset, area_type } = input;
  assertResultWindow(offset, limit);

  const response = await searchAreas(input);
  const filters = [`query "${query}"`];
  if (area_type !== undefined) filters.push(`area type ${area_type}`);
  return formatSearchPage({
    kind: "area",
    total: response.total,
    offset,
    limit,
    lines: response.documents.map((area) => formatAreaLine(area)),
    filters,
  });
}

export async function handleGetArea(input: GetAreaInput): Promise<string> {
  const area = await getArea(input.id);
  return formatAreaDetail(area);
}

export const areaToolDefinitions = [
  {
    name: "search_areas",
    title: "Search areas",
    description:
      "Search Camptocamp.org areas by name (titles match in any language, fuzzily — check the returned titles; towns are not areas, search the range or département instead). area_type: range = mountain range/massif; admin_limits = administrative subdivision such as a French département or Swiss canton; country = country. Returns ID, title and type, after a header giving the total, the offset and the filters. Pass the returned ID as area_id to search_routes, search_waypoints and search_outings. " +
      PAGING_NOTE,
    inputSchema: searchAreasSchema,
    handler: handleSearchAreas,
  },
  {
    name: "get_area",
    title: "Get area details",
    description:
      "Get a Camptocamp.org area by ID: title, type, summary and description. No geometry, no route count; use search_routes / search_waypoints with area_id for those. The second line is the document's camptocamp.org URL, to cite as the source. " +
      USER_TEXT_NOTE,
    inputSchema: getAreaSchema,
    handler: handleGetArea,
  },
];
