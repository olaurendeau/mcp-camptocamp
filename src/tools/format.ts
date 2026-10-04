// Formatting helpers shared by the tool handlers. Parameter types come from the shared response
// schemas and are structural, so any response shape with the fields a helper reads (search result,
// detail, association) can be passed.
import type {
  AreaSummary,
  Locale,
  RouteAssociation,
  RouteSearchResult,
  TitledAssociation,
  WaypointAssociation,
} from "../api/schemas.js";
import { formatRatingParts } from "./ratings.js";

// Locale fallback order after fr. Only [it, en] → en was observed live (route 675555 has [it, en] and a
// `pl=fr` search returns en); the rest of the order is decision D1 on #57.
const LANG_ORDER = ["fr", "en", "it", "de", "es", "ca", "eu", "sl", "zh"];

// Detail endpoints return every locale in no useful order (book 373877: it, fr, en; article 716039:
// en before fr), so pick the one a `pl=fr` search would return: fr, then LANG_ORDER, then the first.
export function pickLocale<T extends { lang: string }>(locales: T[]): T | undefined {
  for (const lang of LANG_ORDER) {
    const locale = locales.find((l) => l.lang === lang);
    if (locale) return locale;
  }
  return locales[0];
}

export function pickTitle(locales: Locale[]): string {
  return pickLocale(locales)?.title ?? "Untitled";
}

export function joinList(values?: string[] | null): string | undefined {
  return values && values.length > 0 ? values.join(", ") : undefined;
}

const SITE_URL = "https://www.camptocamp.org";

// The document type segment of a camptocamp.org URL: a typo fails the typecheck instead of printing a
// dead link.
export type DocumentPath = "routes" | "waypoints" | "outings" | "areas" | "books" | "articles";

// The heading and, on the next line, the document's page on camptocamp.org.
export function formatHeader(title: string, documentId: number, path: DocumentPath): string[] {
  return [`# ${title} (ID: ${documentId})`, `**URL**: ${SITE_URL}/${path}/${documentId}`];
}

// A route's name as Camptocamp shows it: "<summit> : <title>". Both parts are trimmed and a blank one is
// left out, so a blank title_prefix (route 1678194 has "") or title never leaves a dangling " : ".
export function formatRouteName(locale?: RouteAssociation["locales"][number]): string {
  const parts = [locale?.title_prefix?.trim(), locale?.title.trim()].filter((part) => !!part);
  return parts.length > 0 ? parts.join(" : ") : "Untitled";
}

// A route in a search result: "- [id] <name> (<activities>) | Max elevation: Xm | Elevation gain: Ym | <ratings>".
export function formatRouteLine(route: RouteSearchResult): string {
  const activities = route.activities.length > 0 ? ` (${route.activities.join(", ")})` : "";
  const parts = [`- [${route.document_id}] ${formatRouteName(pickLocale(route.locales))}${activities}`];
  if (route.elevation_max != null) parts.push(`Max elevation: ${route.elevation_max}m`);
  if (route.height_diff_up != null) parts.push(`Elevation gain: ${route.height_diff_up}m`);
  return [...parts, ...formatRatingParts(route)].join(" | ");
}

// A route associated with another document (outing, book, article): "- [id] <name> | <ratings>".
export function formatAssociatedRouteLine(route: RouteAssociation): string {
  const name = `- [${route.document_id}] ${formatRouteName(pickLocale(route.locales))}`;
  return [name, ...formatRatingParts(route)].join(" | ");
}

export function formatWaypointLine(waypoint: WaypointAssociation): string {
  const elevation = waypoint.elevation != null ? ` | ${waypoint.elevation}m` : "";
  return `- [${waypoint.document_id}] ${pickTitle(waypoint.locales)} (${waypoint.waypoint_type})${elevation}`;
}

export function formatTitledLine(document: TitledAssociation): string {
  return `- [${document.document_id}] ${pickTitle(document.locales)}`;
}

export function formatAreaLine(area: AreaSummary): string {
  return `- [${area.document_id}] ${pickTitle(area.locales)} (${area.area_type})`;
}

export function formatAreasSection(areas?: AreaSummary[] | null): string[] {
  if (!areas || areas.length === 0) return [];
  return ["\n## Areas", ...areas.map(formatAreaLine)];
}
