import { z } from "zod";
import { searchUserOutings, getOuting } from "../api/camptocamp.js";
import type { OutingSearchResponse, OutingDetail } from "../api/camptocamp.js";

export const searchUserOutingsSchema = z.object({
  user_id: z.number().int().positive().describe("Camptocamp user ID (e.g. 430052 for username o.laurendeau)"),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
});

export const getOutingSchema = z.object({
  id: z.number().int().positive().describe("Outing ID from Camptocamp"),
});

export type SearchUserOutingsInput = z.infer<typeof searchUserOutingsSchema>;
export type GetOutingInput = z.infer<typeof getOutingSchema>;

function formatDateRange(dateStart?: string, dateEnd?: string): string {
  if (!dateStart) return "";
  if (!dateEnd || dateStart === dateEnd) return dateStart;
  return `${dateStart} → ${dateEnd}`;
}

function formatOutingSearchResult(response: OutingSearchResponse, userId: number): string {
  if (response.documents.length === 0) {
    return `No outings found for user ${userId}.`;
  }

  const lines: string[] = [
    `Found ${response.total} outing(s) for user ${userId}. Showing ${response.documents.length}:\n`,
  ];

  for (const outing of response.documents) {
    const locale = outing.locales.find((l) => l.lang === "fr") ?? outing.locales[0];
    const title = locale?.title ?? "Untitled";
    const activities = outing.activities.join(", ");
    const date = formatDateRange(outing.date_start, outing.date_end);
    const datePart = date ? ` | ${date}` : "";
    const elevation = outing.elevation_max ? ` | Max elevation: ${outing.elevation_max}m` : "";
    const rating = outing.global_rating ? ` | Rating: ${outing.global_rating}` : "";

    lines.push(`- [${outing.document_id}] ${title} (${activities})${datePart}${elevation}${rating}`);
  }

  return lines.join("\n");
}

function formatOutingDetail(outing: OutingDetail): string {
  const locale = outing.locales.find((l) => l.lang === "fr") ?? outing.locales[0];
  const lines: string[] = [];

  lines.push(`# ${locale?.title ?? "Untitled"} (ID: ${outing.document_id})`);

  if (outing.author) {
    lines.push(`**Author**: ${outing.author.name} (user ID: ${outing.author.user_id})`);
  }

  lines.push(`\n**Activities**: ${outing.activities.join(", ")}`);

  const date = formatDateRange(outing.date_start, outing.date_end);
  if (date) lines.push(`**Date**: ${date}`);
  if (outing.participant_count) lines.push(`**Participants**: ${outing.participant_count}`);

  if (outing.global_rating) lines.push(`**Global rating**: ${outing.global_rating}`);
  if (outing.hiking_rating) lines.push(`**Hiking rating**: ${outing.hiking_rating}`);
  if (outing.rock_free_rating) lines.push(`**Rock free rating**: ${outing.rock_free_rating}`);
  if (outing.engagement_rating) lines.push(`**Engagement**: ${outing.engagement_rating}`);
  if (outing.equipment_rating) lines.push(`**Equipment**: ${outing.equipment_rating}`);
  if (outing.condition_rating) lines.push(`**Conditions**: ${outing.condition_rating}`);

  if (outing.elevation_max) lines.push(`**Max elevation**: ${outing.elevation_max}m`);
  if (outing.elevation_min) lines.push(`**Min elevation**: ${outing.elevation_min}m`);
  if (outing.height_diff_up) lines.push(`**Elevation gain**: ${outing.height_diff_up}m`);
  if (outing.height_diff_down) lines.push(`**Elevation loss**: ${outing.height_diff_down}m`);

  if (locale?.description) {
    lines.push(`\n## Description\n${locale.description}`);
  }

  if (locale?.route_description) {
    lines.push(`\n## Route description\n${locale.route_description}`);
  }

  if (locale?.conditions) {
    lines.push(`\n## Conditions\n${locale.conditions}`);
  }

  if (locale?.weather) {
    lines.push(`\n## Weather\n${locale.weather}`);
  }

  if (locale?.timing) {
    lines.push(`\n## Timing\n${locale.timing}`);
  }

  if (locale?.participants) {
    lines.push(`\n## Participants\n${locale.participants}`);
  }

  const routes = outing.associations?.routes;
  if (routes && routes.length > 0) {
    lines.push("\n## Associated routes");
    for (const route of routes) {
      const routeLocale = route.locales.find((l) => l.lang === "fr") ?? route.locales[0];
      lines.push(`- [${route.document_id}] ${routeLocale?.title ?? "Untitled"}`);
    }
  }

  return lines.join("\n");
}

export async function handleSearchUserOutings(input: SearchUserOutingsInput): Promise<string> {
  const response = await searchUserOutings(input.user_id, input.limit);
  return formatOutingSearchResult(response, input.user_id);
}

export async function handleGetOuting(input: GetOutingInput): Promise<string> {
  const outing = await getOuting(input.id);
  return formatOutingDetail(outing);
}

export const outingToolDefinitions = [
  {
    name: "search_user_outings",
    description:
      "List outings (trip reports) published by a Camptocamp user. Returns outings with ID, title, activities, date, elevation, and rating. Use the user_id from the Camptocamp profile URL (e.g. u=430052).",
    inputSchema: searchUserOutingsSchema,
    handler: handleSearchUserOutings,
  },
  {
    name: "get_outing",
    description:
      "Get full details of a specific outing (trip report) from Camptocamp.org by its ID, including description, conditions, weather, participants, and associated routes.",
    inputSchema: getOutingSchema,
    handler: handleGetOuting,
  },
];
