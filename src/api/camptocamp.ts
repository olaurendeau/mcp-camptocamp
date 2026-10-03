const BASE_URL = "https://api.camptocamp.org";
const DEFAULT_LANG = "fr";
const DEFAULT_LIMIT = 10;

export interface RouteSearchResult {
  document_id: number;
  locales: Array<{ lang: string; title: string; title_prefix?: string }>;
  activities: string[];
  elevation_max?: number;
  height_diff_difficulties?: number;
  rock_free_rating?: string;
  global_rating?: string;
}

export interface RouteSearchResponse {
  documents: RouteSearchResult[];
  total: number;
}

export interface RouteDetail {
  document_id: number;
  locales: Array<{
    lang: string;
    title: string;
    description?: string;
    remarks?: string;
    gear?: string;
    route_history?: string;
  }>;
  activities: string[];
  elevation_max?: number;
  elevation_min?: number;
  height_diff_up?: number;
  height_diff_down?: number;
  rock_free_rating?: string;
  rock_required_rating?: string;
  global_rating?: string;
  engagement_rating?: string;
  equipment_rating?: string;
  durations?: string[];
  main_waypoint_id?: number;
  geometry?: {
    geom_detail?: string;
  };
  areas?: AreaSearchResult[] | null;
}

export interface WaypointSearchResult {
  document_id: number;
  locales: Array<{ lang: string; title: string }>;
  waypoint_type: string;
  elevation?: number;
}

export interface WaypointSearchResponse {
  documents: WaypointSearchResult[];
  total: number;
}

export interface WaypointDetail {
  document_id: number;
  locales: Array<{
    lang: string;
    title: string;
    description?: string;
    access?: string;
  }>;
  waypoint_type: string;
  elevation?: number;
  geometry?: {
    geom?: string;
  };
  areas?: AreaSearchResult[] | null;
}

export async function searchRoutes(
  query: string | undefined,
  limit = DEFAULT_LIMIT,
  lang = DEFAULT_LANG,
  areaId?: number,
): Promise<RouteSearchResponse> {
  const params = new URLSearchParams();
  if (query !== undefined) params.set("q", query);
  params.set("limit", String(limit));
  params.set("lang", lang);
  if (areaId !== undefined) params.set("a", String(areaId));
  const response = await fetch(`${BASE_URL}/routes?${params}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<RouteSearchResponse>;
}

export async function getRoute(id: number, lang = DEFAULT_LANG): Promise<RouteDetail> {
  const params = new URLSearchParams({ lang });
  const response = await fetch(`${BASE_URL}/routes/${id}?${params}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<RouteDetail>;
}

export async function searchWaypoints(
  query: string | undefined,
  limit = DEFAULT_LIMIT,
  lang = DEFAULT_LANG,
  areaId?: number,
): Promise<WaypointSearchResponse> {
  const params = new URLSearchParams();
  if (query !== undefined) params.set("q", query);
  params.set("limit", String(limit));
  params.set("lang", lang);
  if (areaId !== undefined) params.set("a", String(areaId));
  const response = await fetch(`${BASE_URL}/waypoints?${params}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<WaypointSearchResponse>;
}

export async function getWaypoint(id: number, lang = DEFAULT_LANG): Promise<WaypointDetail> {
  const params = new URLSearchParams({ lang });
  const response = await fetch(`${BASE_URL}/waypoints/${id}?${params}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<WaypointDetail>;
}

export interface OutingSearchResult {
  document_id: number;
  locales: Array<{ lang: string; title: string }>;
  activities: string[];
  date_start?: string;
  date_end?: string;
  elevation_max?: number;
  height_diff_up?: number;
  global_rating?: string;
  hiking_rating?: string;
  rock_free_rating?: string;
  author?: { name: string; user_id: number };
}

export interface OutingSearchResponse {
  documents: OutingSearchResult[];
  total: number;
}

export interface OutingDetail {
  document_id: number;
  locales: Array<{
    lang: string;
    title: string;
    description?: string;
    conditions?: string;
    participants?: string;
    route_description?: string;
    timing?: string;
    weather?: string;
  }>;
  activities: string[];
  date_start?: string;
  date_end?: string;
  elevation_max?: number;
  elevation_min?: number;
  height_diff_up?: number;
  height_diff_down?: number;
  global_rating?: string;
  engagement_rating?: string;
  equipment_rating?: string;
  hiking_rating?: string;
  rock_free_rating?: string;
  condition_rating?: string;
  participant_count?: number;
  author?: { name: string; user_id: number };
  associations?: {
    routes?: Array<{
      document_id: number;
      locales: Array<{ lang: string; title: string }>;
    }>;
  };
}

export async function searchUserOutings(
  userId: number,
  limit = DEFAULT_LIMIT,
  lang = DEFAULT_LANG,
): Promise<OutingSearchResponse> {
  const params = new URLSearchParams({ u: String(userId), limit: String(limit), lang });
  const response = await fetch(`${BASE_URL}/outings?${params}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<OutingSearchResponse>;
}

export async function getOuting(id: number, lang = DEFAULT_LANG): Promise<OutingDetail> {
  const params = new URLSearchParams({ lang });
  const response = await fetch(`${BASE_URL}/outings/${id}?${params}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<OutingDetail>;
}

export type AreaType = "range" | "admin_limits" | "country";

export interface AreaSearchResult {
  document_id: number;
  locales: Array<{ lang: string; title: string }>;
  area_type: string; // printed verbatim, never narrowed or translated
  available_langs?: string[] | null;
}

export interface AreaSearchResponse {
  documents: AreaSearchResult[];
  total: number;
}

export interface AreaDetail {
  document_id: number;
  area_type: string;
  locales: Array<{
    lang: string;
    title: string;
    summary?: string | null;
    description?: string | null;
  }>;
  geometry?: { geom?: string | null; geom_detail?: string | null } | null; // typed for fixtures only; never displayed
}

export async function searchAreas(
  query: string,
  limit = DEFAULT_LIMIT,
  lang = DEFAULT_LANG,
  areaType?: AreaType,
): Promise<AreaSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit), lang });
  if (areaType !== undefined) params.set("atyp", areaType);
  const response = await fetch(`${BASE_URL}/areas?${params}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<AreaSearchResponse>;
}

export async function getArea(id: number, lang = DEFAULT_LANG): Promise<AreaDetail> {
  const params = new URLSearchParams({ lang });
  const response = await fetch(`${BASE_URL}/areas/${id}?${params}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<AreaDetail>;
}

// The API treats `date=X,` as the single day X, so open-ended ranges use these bounds.
const DATE_MIN = "0001-01-01";
const DATE_MAX = "9999-12-31";

export interface OutingSearchParams {
  query?: string;
  area_id?: number;
  activity?: string;
  date_from?: string;
  date_to?: string;
  route_id?: number;
  waypoint_id?: number;
  limit?: number; // default DEFAULT_LIMIT
  offset?: number; // default 0
}

export interface OutingListItem {
  document_id: number;
  locales: Array<{ lang: string; title: string }>;
  activities: string[];
  date_start?: string | null;
  date_end?: string | null;
  condition_rating?: string | null;
  elevation_max?: number | null;
  height_diff_up?: number | null;
  global_rating?: string | null;
  ski_rating?: string | null;
  labande_global_rating?: string | null;
  rock_free_rating?: string | null;
  ice_rating?: string | null;
  hiking_rating?: string | null;
  snowshoe_rating?: string | null;
  areas?: Array<{
    document_id: number;
    area_type?: string | null;
    locales: Array<{ lang: string; title: string }>;
  }> | null;
  author?: { name: string; user_id: number } | null;
}

export interface OutingListResponse {
  documents: OutingListItem[];
  total: number;
}

export async function searchOutings(params: OutingSearchParams = {}, lang = DEFAULT_LANG): Promise<OutingListResponse> {
  const search = new URLSearchParams();
  // `q=` (empty) returns every outing, so only send a non-empty keyword.
  if (params.query) search.set("q", params.query);
  if (params.area_id !== undefined) search.set("a", String(params.area_id));
  if (params.activity !== undefined) search.set("act", params.activity);
  if (params.date_from !== undefined || params.date_to !== undefined) {
    search.set("date", `${params.date_from ?? DATE_MIN},${params.date_to ?? DATE_MAX}`);
  }
  if (params.route_id !== undefined) search.set("r", String(params.route_id));
  if (params.waypoint_id !== undefined) search.set("w", String(params.waypoint_id));
  search.set("sort", "-date_end");
  search.set("limit", String(params.limit ?? DEFAULT_LIMIT));
  search.set("offset", String(params.offset ?? 0));
  search.set("lang", lang);
  const response = await fetch(`${BASE_URL}/outings?${search}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<OutingListResponse>;
}

export interface BookSearchResult {
  document_id: number;
  locales: Array<{ lang: string; title: string; summary?: string | null }>;
  author?: string | null;
  activities?: string[] | null;
  book_types?: string[] | null;
  available_langs?: string[] | null;
  quality?: string;
}

export interface BookSearchResponse {
  documents: BookSearchResult[];
  total: number;
}

export interface BookDetail {
  document_id: number;
  locales: Array<{
    lang: string;
    title: string;
    summary?: string | null;
    description?: string | null;
  }>;
  author?: string | null;
  editor?: string | null;
  isbn?: string | null;
  url?: string | null;
  nb_pages?: number | null;
  publication_date?: string | null;
  langs?: string[] | null; // languages the book is published in
  available_langs?: string[] | null; // languages of the Camptocamp page; never displayed
  activities?: string[] | null;
  book_types?: string[] | null;
  associations?: {
    routes?: Array<{
      document_id: number;
      locales: Array<{ lang: string; title: string; title_prefix?: string | null }>;
    }>;
    waypoints?: Array<{
      document_id: number;
      locales: Array<{ lang: string; title: string }>;
      waypoint_type: string;
      elevation?: number | null;
    }>;
    articles?: Array<{ document_id: number; locales: Array<{ lang: string; title: string }> }>;
  };
}

export async function searchBooks(
  query: string,
  limit = DEFAULT_LIMIT,
  lang = DEFAULT_LANG,
): Promise<BookSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit), lang });
  const response = await fetch(`${BASE_URL}/books?${params}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<BookSearchResponse>;
}

export async function getBook(id: number, lang = DEFAULT_LANG): Promise<BookDetail> {
  const params = new URLSearchParams({ lang });
  const response = await fetch(`${BASE_URL}/books/${id}?${params}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<BookDetail>;
}

export interface ArticleSearchResult {
  document_id: number;
  locales: Array<{ lang: string; title: string; summary?: string | null }>;
  article_type?: string | null; // "collab" | "personal", printed verbatim
  categories?: string[] | null;
  activities?: string[] | null;
  quality?: string | null;
}

export interface ArticleSearchResponse {
  documents: ArticleSearchResult[];
  total: number;
}

// images, users and xreports associations are left out on purpose: no tool can follow them.
export interface ArticleDetail {
  document_id: number;
  locales: Array<{
    lang: string;
    title: string;
    summary?: string | null;
    description?: string | null;
  }>;
  article_type?: string | null;
  categories?: string[] | null;
  activities?: string[] | null;
  quality?: string | null;
  author?: { name: string; user_id: number } | null;
  associations?: {
    routes?: Array<{
      document_id: number;
      locales: Array<{ lang: string; title: string; title_prefix?: string | null }>;
    }>;
    waypoints?: Array<{
      document_id: number;
      locales: Array<{ lang: string; title: string }>;
      waypoint_type: string;
      elevation?: number | null;
    }>;
    articles?: Array<{ document_id: number; locales: Array<{ lang: string; title: string }> }>;
    outings?: Array<{ document_id: number; locales: Array<{ lang: string; title: string }> }>;
    books?: Array<{ document_id: number; locales: Array<{ lang: string; title: string }> }>;
  };
}

export async function searchArticles(
  query: string,
  limit = DEFAULT_LIMIT,
  lang = DEFAULT_LANG,
): Promise<ArticleSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit), lang });
  const response = await fetch(`${BASE_URL}/articles?${params}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<ArticleSearchResponse>;
}

export async function getArticle(id: number, lang = DEFAULT_LANG): Promise<ArticleDetail> {
  const params = new URLSearchParams({ lang });
  const response = await fetch(`${BASE_URL}/articles/${id}?${params}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<ArticleDetail>;
}
