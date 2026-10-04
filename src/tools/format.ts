// Formatting helpers shared by the tool handlers. Parameter types come from the shared response
// schemas and are structural, so any response shape with the fields a helper reads (search result,
// detail, association) can be passed.
import { isMalformed } from "../api/schemas.js";
import type {
  AreaSummary,
  BookSearchResult,
  Locale,
  MalformedItem,
  OutingListItem,
  OutingListResponse,
  RouteAssociation,
  RouteSearchResult,
  TitledAssociation,
  WaypointAssociation,
} from "../api/schemas.js";
import { formatRatingParts } from "./ratings.js";
import { hasUserText, type TextSection } from "./text.js";
import type { Lang } from "./enums.js";

// Locale fallback order after the requested language: the API's own `pl` fallback (#141 on #153). The live
// contract tests pin it on searches for fr before en, sl and es, en before it and ca, it before de, sl and es,
// es before ca, eu and sl (#203); de/es, ca/eu, eu/sl and sl/zh were not observed.
export const LANG_ORDER = ["fr", "en", "it", "de", "es", "ca", "eu", "sl", "zh"] as const satisfies readonly Lang[];

// Detail endpoints return every locale in no useful order (book 373877: it, fr, en; article 716039:
// en before fr), so pick the one a `pl=<lang>` search would return: the requested language, then
// LANG_ORDER, then the first (AC5.6 on #153).
export function pickLocale<T extends { lang: string }>(locales: T[], lang = "fr"): T | undefined {
  for (const candidate of [lang, ...LANG_ORDER]) {
    const locale = locales.find((l) => l.lang === candidate);
    if (locale) return locale;
  }
  return locales[0];
}

export function pickTitle(locales: Locale[], lang?: string): string {
  return pickLocale(locales, lang)?.title ?? "Untitled";
}

// The Language line of a detail when it has no text in the requested language (decision D3 on #153):
// `**Language**: en (no de version; available: it, en)`, the available languages in API order. No line
// when the requested language is present or there is no locale at all.
export function formatLanguageLine(locales: { lang: string }[], lang = "fr"): string[] {
  const picked = pickLocale(locales, lang);
  if (!picked || picked.lang === lang) return [];
  const available = locales.map((locale) => locale.lang).join(", ");
  return [`**Language**: ${picked.lang} (no ${lang} version; available: ${available})`];
}

// A locale with free-text fields F, each possibly missing or null.
type TextLocale<F extends string> = { lang: string } & Partial<Record<F, string | null>>;

// The free-text sections the shown locale has no text for and other locales have (D1 on #210):
// `**Text in other languages**: gear (de, en, it), …`, fields in section order with their API names, languages
// in API order. `shown` is the locale pickLocale picked, so a fallback is compared, not the requested language.
// No other locale's text is printed, and there is no line when no field qualifies.
export function formatOtherLanguagesLine<F extends string>(
  locales: readonly TextLocale<F>[],
  shown: TextLocale<F> | undefined,
  sections: readonly TextSection<F>[],
): string[] {
  const fields = sections.flatMap(([field]) => {
    if (hasUserText(shown?.[field])) return [];
    const langs = locales.filter((locale) => locale !== shown && hasUserText(locale[field])).map((l) => l.lang);
    return langs.length > 0 ? [`${field} (${langs.join(", ")})`] : [];
  });
  return fields.length > 0 ? [`**Text in other languages**: ${fields.join(", ")}`] : [];
}

// A list as tolerantArray parses it: each item is well-formed or a MalformedItem.
export type ListOf<T> = readonly (T | MalformedItem)[];

// Why a malformed item with a readable ID is not shown.
export const MALFORMED_ITEM_NOTE = "not shown: Camptocamp sent this item in an unexpected format";

// The placeholder of a malformed item, without the "- " of a list line (#129, decision D2 on #153).
export function formatMalformed(item: MalformedItem): string {
  return item.document_id === undefined
    ? "(not shown: Camptocamp sent an item in an unexpected format)"
    : `[${item.document_id}] (${MALFORMED_ITEM_NOTE})`;
}

// One line per item, in API order: `format` for a well-formed item, a placeholder line for a malformed one,
// so the counts printed next to a list still match its lines.
export function formatListItems<T extends object>(items: ListOf<T>, format: (item: T) => string): string[] {
  return items.map((item) => (isMalformed(item) ? `- ${formatMalformed(item)}` : format(item)));
}

export function joinList(values?: string[] | null): string | undefined {
  return values && values.length > 0 ? values.join(", ") : undefined;
}

// The type isPresent narrows a present value to. The brand is never set at runtime: it only keeps the
// false branch from narrowing to null | undefined, since "" and [] are absent too.
declare const present: unique symbol;
export type Present<T> = NonNullable<T> & { readonly [present]: true };

// Rule R1 of #58: null, undefined, "" and [] are absent and their line is left out; 0 and false are
// values and are printed (waypoint 1350803 is at elevation 0).
export function isPresent<T>(value: T): value is Present<T> {
  if (value == null || value === "") return false;
  return !Array.isArray(value) || value.length > 0;
}

// An outing's dates: "start → end", or one date when both are equal or only one is set (#36: an outing
// with only date_end prints that date). The missing bound is never invented.
export function formatDateRange(dateStart?: string | null, dateEnd?: string | null): string {
  const start = isPresent(dateStart) ? dateStart : undefined;
  const end = isPresent(dateEnd) ? dateEnd : undefined;
  if (start && end && start !== end) return `${start} → ${end}`;
  return start ?? end ?? "";
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
export function formatRouteLine(route: RouteSearchResult, lang?: string): string {
  const activities = route.activities.length > 0 ? ` (${route.activities.join(", ")})` : "";
  const parts = [`- [${route.document_id}] ${formatRouteName(pickLocale(route.locales, lang))}${activities}`];
  if (isPresent(route.elevation_max)) parts.push(`Max elevation: ${route.elevation_max}m`);
  if (isPresent(route.height_diff_up)) parts.push(`Elevation gain: ${route.height_diff_up}m`);
  return [...parts, ...formatRatingParts(route)].join(" | ");
}

// A route associated with another document (outing, book, article): "- [id] <name> | <ratings>".
export function formatAssociatedRouteLine(route: RouteAssociation, lang?: string): string {
  const name = `- [${route.document_id}] ${formatRouteName(pickLocale(route.locales, lang))}`;
  return [name, ...formatRatingParts(route)].join(" | ");
}

// A virtual waypoint groups documents (waypoint 1947492 "Ouvertures 2013" groups the routes first climbed
// in 2013) and has no real location: the API still sends a placeholder elevation (0) and position (43.0, 8.0),
// which Camptocamp's own map hides (decision D5 on #153).
export function isVirtualWaypoint(waypoint: Pick<WaypointAssociation, "waypoint_type">): boolean {
  return waypoint.waypoint_type === "virtual";
}

// "- [id] <title> (<type>) | <elevation>m", ending "| main waypoint" for a route's main_waypoint_id. A
// virtual waypoint has no elevation part. A malformed waypoint prints its placeholder, still followed by the
// main marker (review of #188).
export function formatWaypointLine(
  waypoint: WaypointAssociation | MalformedItem,
  options: { main?: boolean; lang?: string } = {},
): string {
  const parts: string[] = [];
  if (isMalformed(waypoint)) {
    parts.push(`- ${formatMalformed(waypoint)}`);
  } else {
    parts.push(`- [${waypoint.document_id}] ${pickTitle(waypoint.locales, options.lang)} (${waypoint.waypoint_type})`);
    if (isPresent(waypoint.elevation) && !isVirtualWaypoint(waypoint)) parts.push(`${waypoint.elevation}m`);
  }
  if (options.main) parts.push("main waypoint");
  return parts.join(" | ");
}

// A book in a search result or a route's associations: "- [id] <title> | Author: … | Types: … | Activities: …".
// The title is printed verbatim: book 14643 has a double space in "Vanoise -  Tarentaise".
export function formatBookLine(book: BookSearchResult, lang?: string): string {
  const parts = [`- [${book.document_id}] ${pickTitle(book.locales, lang)}`];
  const types = joinList(book.book_types);
  const activities = joinList(book.activities);
  if (book.author) parts.push(`Author: ${book.author}`);
  if (types) parts.push(`Types: ${types}`);
  if (activities) parts.push(`Activities: ${activities}`);
  return parts.join(" | ");
}

// An outing in search_outings and in a document's recent outings: "- [id] <title> (<activities>) | <dates> |
// Conditions: … | Max elevation: Xm | Elevation gain: Ym | <ratings> | Areas: <ranges> | Author: …".
export function formatOutingLine(outing: OutingListItem, lang?: string): string {
  const parts: string[] = [];
  const push = (label: string, value: string | number | null | undefined, unit = ""): void => {
    if (isPresent(value)) parts.push(`${label}${value}${unit}`);
  };

  push("", formatDateRange(outing.date_start, outing.date_end));
  push("Conditions: ", outing.condition_rating);
  push("Max elevation: ", outing.elevation_max, "m");
  push("Elevation gain: ", outing.height_diff_up, "m");
  parts.push(...formatRatingParts(outing));

  const ranges = (outing.areas ?? []).filter((area) => area.area_type === "range");
  if (ranges.length > 0) {
    parts.push(`Areas: ${ranges.map((area) => `${pickTitle(area.locales, lang)} [${area.document_id}]`).join(", ")}`);
  }
  push("Author: ", outing.author?.name);

  const head = `- [${outing.document_id}] ${pickTitle(outing.locales, lang)} (${outing.activities.join(", ")})`;
  return [head, ...parts].join(" | ");
}

// The recent outings of a route or waypoint: the API sends the latest few and the total count, so the
// heading gives both and, when some are not shown, "More: <more>" says how to list them all.
export function formatRecentOutings(
  recent: OutingListResponse | null | undefined,
  more: string,
  lang?: string,
): string[] {
  if (!recent || recent.documents.length === 0) return [];
  const shown = recent.documents.length;
  const lines = [
    `\n## Recent outings (${shown} of ${recent.total})`,
    ...formatListItems(recent.documents, (outing) => formatOutingLine(outing, lang)),
  ];
  if (recent.total > shown) lines.push(`More: ${more}`);
  return lines;
}

export function formatTitledLine(document: TitledAssociation, lang?: string): string {
  return `- [${document.document_id}] ${pickTitle(document.locales, lang)}`;
}

export function formatAreaLine(area: AreaSummary, lang?: string): string {
  return `- [${area.document_id}] ${pickTitle(area.locales, lang)} (${area.area_type})`;
}

export function formatAreasSection(areas?: ListOf<AreaSummary> | null, lang?: string): string[] {
  if (!areas || areas.length === 0) return [];
  return ["\n## Areas", ...formatListItems(areas, (area) => formatAreaLine(area, lang))];
}
