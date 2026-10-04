import { z } from "zod";
import { searchAreas, getArea } from "../api/camptocamp.js";
import type { AreaSearchResponse, AreaDetail } from "../api/camptocamp.js";
import { pickLocale, formatHeader, formatAreaLine } from "./format.js";

export const searchAreasSchema = z.object({
  query: z.string().describe("Area name in any language (e.g. 'Écrins', 'Valais', 'Wallis')"),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  area_type: z
    .enum(["range", "admin_limits", "country"])
    .optional()
    .describe("Restrict to one area type: range, admin_limits or country"),
});

export const getAreaSchema = z.object({
  id: z.number().int().positive().describe("Area ID from Camptocamp"),
});

export type SearchAreasInput = z.infer<typeof searchAreasSchema>;
export type GetAreaInput = z.infer<typeof getAreaSchema>;

function formatAreaSearchResult(response: AreaSearchResponse): string {
  if (response.documents.length === 0) {
    return "No areas found.";
  }

  const lines: string[] = [`Found ${response.total} area(s). Showing ${response.documents.length}:\n`];
  lines.push(...response.documents.map(formatAreaLine));
  return lines.join("\n");
}

function formatAreaDetail(area: AreaDetail): string {
  const locale = pickLocale(area.locales);
  const lines: string[] = [];

  lines.push(formatHeader(locale?.title ?? "Untitled", area.document_id));
  lines.push(`\n**Type**: ${area.area_type}`);

  if (locale?.summary) {
    lines.push(`\n## Summary\n${locale.summary}`);
  }

  if (locale?.description) {
    lines.push(`\n## Description\n${locale.description}`);
  }

  return lines.join("\n");
}

export async function handleSearchAreas(input: SearchAreasInput): Promise<string> {
  const response = await searchAreas(input.query, input.limit, undefined, input.area_type);
  return formatAreaSearchResult(response);
}

export async function handleGetArea(input: GetAreaInput): Promise<string> {
  const area = await getArea(input.id);
  return formatAreaDetail(area);
}

export const areaToolDefinitions = [
  {
    name: "search_areas",
    description:
      "Search Camptocamp.org areas by name (titles match in any language, fuzzily — check the returned titles; towns are not areas, search the range or département instead). area_type: range = mountain range/massif; admin_limits = administrative subdivision such as a French département or Swiss canton; country = country. Returns ID, title and type. Pass the returned ID as area_id to search_routes, search_waypoints and search_outings.",
    inputSchema: searchAreasSchema,
    handler: handleSearchAreas,
  },
  {
    name: "get_area",
    description:
      "Get a Camptocamp.org area by ID: title, type, summary and description as published (Camptocamp markup included). No geometry, no route count; use search_routes / search_waypoints with area_id for those.",
    inputSchema: getAreaSchema,
    handler: handleGetArea,
  },
];
