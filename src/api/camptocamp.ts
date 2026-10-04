import { getJson } from "./http.js";
import type {
  RouteSearchResponse,
  RouteDetail,
  WaypointSearchResponse,
  WaypointDetail,
  OutingSearchResponse,
  OutingDetail,
  OutingListResponse,
  AreaSearchResponse,
  AreaDetail,
  BookSearchResponse,
  BookDetail,
  ArticleSearchResponse,
  ArticleDetail,
} from "./schemas.js";
import {
  routeSearchResponseSchema,
  routeDetailSchema,
  waypointSearchResponseSchema,
  waypointDetailSchema,
  outingSearchResponseSchema,
  outingDetailSchema,
  outingListResponseSchema,
  areaSearchResponseSchema,
  areaDetailSchema,
  bookSearchResponseSchema,
  bookDetailSchema,
  articleSearchResponseSchema,
  articleDetailSchema,
} from "./schemas.js";

// Response types are inferred from the zod schemas in schemas.ts; re-exported under their usual names.
export type {
  RouteSearchResult,
  RouteSearchResponse,
  RouteDetail,
  WaypointSearchResult,
  WaypointSearchResponse,
  WaypointDetail,
  OutingSearchResult,
  OutingSearchResponse,
  OutingDetail,
  OutingListItem,
  OutingListResponse,
  AreaSearchResult,
  AreaSearchResponse,
  AreaDetail,
  BookSearchResult,
  BookSearchResponse,
  BookDetail,
  ArticleSearchResult,
  ArticleSearchResponse,
  ArticleDetail,
} from "./schemas.js";

// Searches send `pl=fr`: one locale per document, fr first, then the API's fallback (en, it, ...).
// `lang` does nothing and `pl` is ignored on details, so detail requests send no query string.
const PREFERRED_LANG = "fr";
const DEFAULT_LIMIT = 10;

// Options of searchRoutes and searchWaypoints: a keyword, an area, or both.
interface KeywordOrAreaSearchOptions {
  query?: string;
  area_id?: number;
  limit?: number; // default DEFAULT_LIMIT
}
export type WaypointSearchOptions = KeywordOrAreaSearchOptions;

// The 20 route rating systems (Labande counts as two), with the search parameter of each, from
// c2corg v6_api's route search mapping. Each takes a `min,max` range of values from the system's scale.
export const ROUTE_RATING_PARAMS = {
  ski_rating: "trat",
  global_rating: "grat",
  labande_global_rating: "lrat",
  labande_ski_rating: "srat",
  ski_exposition: "sexpo",
  engagement_rating: "erat",
  risk_rating: "orrat",
  equipment_rating: "prat",
  ice_rating: "irat",
  mixed_rating: "mrat",
  exposition_rock_rating: "rexpo",
  rock_free_rating: "frat",
  rock_required_rating: "rrat",
  aid_rating: "arat",
  via_ferrata_rating: "krat",
  hiking_rating: "hrat",
  hiking_mtb_exposition: "hexpo",
  snowshoe_rating: "wrat",
  mtb_up_rating: "mbur",
  mtb_down_rating: "mbdr",
} as const;
export type RouteRatingField = keyof typeof ROUTE_RATING_PARAMS;
export const ROUTE_RATING_FIELDS = Object.keys(ROUTE_RATING_PARAMS) as RouteRatingField[];

export interface RouteSearchOptions extends KeywordOrAreaSearchOptions {
  waypoint_id?: number;
  activity?: string;
  rating?: { system: RouteRatingField; min?: string; max?: string };
  height_diff_up?: { min?: number; max?: number };
  route_types?: string[];
  configuration?: string[];
  offset?: number;
}

// Range filters: `x=min,max`; `x=min` keeps every value from min up and `x=,max` every value up to
// max (checked live: `trat=3.1` matches `3.1,5.6`, `trat=,3.1` matches `1.1,3.1`).
function rangeParam(min?: string | number, max?: string | number): string | undefined {
  if (min === undefined && max === undefined) return undefined;
  if (max === undefined) return String(min);
  return `${min ?? ""},${max}`;
}

function keywordOrAreaParams(options: KeywordOrAreaSearchOptions): URLSearchParams {
  const params = new URLSearchParams();
  if (options.query !== undefined) params.set("q", options.query);
  params.set("limit", String(options.limit ?? DEFAULT_LIMIT));
  params.set("pl", PREFERRED_LANG);
  if (options.area_id !== undefined) params.set("a", String(options.area_id));
  return params;
}

// Options of searchAreas, searchBooks and searchArticles: a required keyword.
interface KeywordSearchOptions {
  query: string;
  limit?: number; // default DEFAULT_LIMIT
}
export type BookSearchOptions = KeywordSearchOptions;
export type ArticleSearchOptions = KeywordSearchOptions;

function keywordParams(options: KeywordSearchOptions): URLSearchParams {
  return new URLSearchParams({ q: options.query, limit: String(options.limit ?? DEFAULT_LIMIT), pl: PREFERRED_LANG });
}

export async function searchRoutes(options: RouteSearchOptions): Promise<RouteSearchResponse> {
  const params = keywordOrAreaParams(options);
  if (options.waypoint_id !== undefined) params.set("w", String(options.waypoint_id));
  if (options.activity !== undefined) params.set("act", options.activity);
  if (options.rating !== undefined) {
    const range = rangeParam(options.rating.min, options.rating.max);
    if (range !== undefined) params.set(ROUTE_RATING_PARAMS[options.rating.system], range);
  }
  const heightDiffUp = rangeParam(options.height_diff_up?.min, options.height_diff_up?.max);
  if (heightDiffUp !== undefined) params.set("hdif", heightDiffUp);
  if (options.route_types?.length) params.set("rtyp", options.route_types.join(","));
  if (options.configuration?.length) params.set("conf", options.configuration.join(","));
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  return getJson({ path: "/routes", params, schema: routeSearchResponseSchema });
}

export async function getRoute(id: number): Promise<RouteDetail> {
  return getJson({ path: `/routes/${id}`, document: { type: "route", id }, schema: routeDetailSchema });
}

export async function searchWaypoints(options: WaypointSearchOptions): Promise<WaypointSearchResponse> {
  return getJson({ path: "/waypoints", params: keywordOrAreaParams(options), schema: waypointSearchResponseSchema });
}

export async function getWaypoint(id: number): Promise<WaypointDetail> {
  return getJson({ path: `/waypoints/${id}`, document: { type: "waypoint", id }, schema: waypointDetailSchema });
}

export interface UserOutingSearchOptions {
  user_id: number;
  limit?: number; // default DEFAULT_LIMIT
}

export async function searchUserOutings(options: UserOutingSearchOptions): Promise<OutingSearchResponse> {
  const params = new URLSearchParams({
    u: String(options.user_id),
    limit: String(options.limit ?? DEFAULT_LIMIT),
    pl: PREFERRED_LANG,
  });
  return getJson({ path: "/outings", params, schema: outingSearchResponseSchema });
}

export async function getOuting(id: number): Promise<OutingDetail> {
  return getJson({ path: `/outings/${id}`, document: { type: "outing", id }, schema: outingDetailSchema });
}

export type AreaType = "range" | "admin_limits" | "country";

export interface AreaSearchOptions extends KeywordSearchOptions {
  area_type?: AreaType;
}

export async function searchAreas(options: AreaSearchOptions): Promise<AreaSearchResponse> {
  const params = keywordParams(options);
  if (options.area_type !== undefined) params.set("atyp", options.area_type);
  return getJson({ path: "/areas", params, schema: areaSearchResponseSchema });
}

export async function getArea(id: number): Promise<AreaDetail> {
  return getJson({ path: `/areas/${id}`, document: { type: "area", id }, schema: areaDetailSchema });
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

export async function searchOutings(params: OutingSearchParams = {}): Promise<OutingListResponse> {
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
  search.set("pl", PREFERRED_LANG);
  return getJson({ path: "/outings", params: search, schema: outingListResponseSchema });
}

export async function searchBooks(options: BookSearchOptions): Promise<BookSearchResponse> {
  return getJson({ path: "/books", params: keywordParams(options), schema: bookSearchResponseSchema });
}

export async function getBook(id: number): Promise<BookDetail> {
  return getJson({ path: `/books/${id}`, document: { type: "book", id }, schema: bookDetailSchema });
}

export async function searchArticles(options: ArticleSearchOptions): Promise<ArticleSearchResponse> {
  return getJson({ path: "/articles", params: keywordParams(options), schema: articleSearchResponseSchema });
}

export async function getArticle(id: number): Promise<ArticleDetail> {
  return getJson({ path: `/articles/${id}`, document: { type: "article", id }, schema: articleDetailSchema });
}
