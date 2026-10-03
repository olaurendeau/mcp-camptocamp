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
}

export async function searchRoutes(
  query: string,
  limit = DEFAULT_LIMIT,
  lang = DEFAULT_LANG,
): Promise<RouteSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit), lang });
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
  query: string,
  limit = DEFAULT_LIMIT,
  lang = DEFAULT_LANG,
): Promise<WaypointSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit), lang });
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
