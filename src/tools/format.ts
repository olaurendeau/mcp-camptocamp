// Formatting helpers shared by the tool handlers. Parameter types are structural, so any response
// shape with the fields a helper reads (search result, detail, association) can be passed.

interface Locale {
  lang: string;
  title: string;
}

interface TitledDocument {
  document_id: number;
  locales: Locale[];
}

// `lang=fr` does not filter locales nor put `fr` first (book 373877 returns it, fr, en; article 716039
// lists en before fr), and some documents have no `fr` at all, so look it up and fall back to the first.
export function pickLocale<T extends { lang: string }>(locales: T[]): T | undefined {
  return locales.find((l) => l.lang === "fr") ?? locales[0];
}

export function pickTitle(locales: Locale[]): string {
  return pickLocale(locales)?.title ?? "Untitled";
}

export function joinList(values?: string[] | null): string | undefined {
  return values && values.length > 0 ? values.join(", ") : undefined;
}

export function formatHeader(title: string, documentId: number): string {
  return `# ${title} (ID: ${documentId})`;
}

export function formatRouteLine(route: {
  document_id: number;
  locales: Array<Locale & { title_prefix?: string | null }>;
}): string {
  const locale = pickLocale(route.locales);
  const title = locale?.title ?? "Untitled";
  const name = locale?.title_prefix ? `${locale.title_prefix} : ${title}` : title;
  return `- [${route.document_id}] ${name}`;
}

export function formatWaypointLine(
  waypoint: TitledDocument & { waypoint_type: string; elevation?: number | null },
): string {
  const elevation = waypoint.elevation != null ? ` | ${waypoint.elevation}m` : "";
  return `- [${waypoint.document_id}] ${pickTitle(waypoint.locales)} (${waypoint.waypoint_type})${elevation}`;
}

export function formatTitledLine(document: TitledDocument): string {
  return `- [${document.document_id}] ${pickTitle(document.locales)}`;
}

export function formatAreaLine(area: TitledDocument & { area_type: string }): string {
  return `- [${area.document_id}] ${pickTitle(area.locales)} (${area.area_type})`;
}

export function formatAreasSection(areas?: Array<TitledDocument & { area_type: string }> | null): string[] {
  if (!areas || areas.length === 0) return [];
  return ["\n## Areas", ...areas.map(formatAreaLine)];
}
