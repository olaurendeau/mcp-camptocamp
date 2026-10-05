import { getJson } from "./http.js";
import { ROUTE_RATING_PARAMS } from "./values.js";
import type { ConditionRating, Lang, OutingRatingField, RouteRatingField } from "./values.js";
import type {
  RouteSearchResponse,
  RouteDetail,
  WaypointSearchResponse,
  WaypointDetail,
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

// Searches send `pl=<lang>` (default fr): one locale per document, that language first, then the API's
// fallback (en, it, ...). `lang` does nothing and `pl` is ignored on details, so they send no query string.
const DEFAULT_LANG: Lang = "fr";
const DEFAULT_LIMIT = 10;

// Options of searchRoutes and searchWaypoints: a keyword, an area, or both.
interface KeywordOrAreaSearchOptions {
  query?: string;
  area_id?: number;
  limit?: number; // default DEFAULT_LIMIT
  lang?: Lang; // sent as pl, default DEFAULT_LANG
}
export interface WaypointSearchOptions extends KeywordOrAreaSearchOptions {
  waypoint_type?: string;
  offset?: number; // sent only when given
}

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
  params.set("pl", options.lang ?? DEFAULT_LANG);
  if (options.area_id !== undefined) params.set("a", String(options.area_id));
  return params;
}

// Options of searchAreas and searchBooks: a required keyword.
interface KeywordSearchOptions {
  query: string;
  limit?: number; // default DEFAULT_LIMIT
  offset?: number; // sent only when given
  lang?: Lang; // sent as pl, default DEFAULT_LANG
}
export interface BookSearchOptions extends KeywordSearchOptions {
  book_type?: string;
  activity?: string;
}
// The keyword is optional once a filter is given. Each filter is sent only when given: `acat` and `act`
// match an article having that value among its categories or activities.
export type ArticleSearchOptions = Omit<KeywordSearchOptions, "query"> & {
  query?: string; // sent as q only when given
  category?: string; // acat
  article_type?: string; // atyp
  activity?: string; // act
};

function keywordParams(options: Omit<KeywordSearchOptions, "query"> & { query?: string }): URLSearchParams {
  const params = new URLSearchParams();
  if (options.query !== undefined) params.set("q", options.query);
  params.set("limit", String(options.limit ?? DEFAULT_LIMIT));
  params.set("pl", options.lang ?? DEFAULT_LANG);
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  return params;
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
  const params = keywordOrAreaParams(options);
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  if (options.waypoint_type !== undefined) params.set("wtyp", options.waypoint_type);
  return getJson({ path: "/waypoints", params, schema: waypointSearchResponseSchema });
}

export async function getWaypoint(id: number): Promise<WaypointDetail> {
  return getJson({ path: `/waypoints/${id}`, document: { type: "waypoint", id }, schema: waypointDetailSchema });
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

// `period` matches month and day in every year, given as dates of one year: 2020, a leap year, so
// that 02-29 exists. A range wrapping around the new year (12-20 → 01-10) matches nothing.
const PERIOD_YEAR = "2020";

export interface OutingSearchParams {
  query?: string;
  area_id?: number;
  activity?: string;
  date_from?: string;
  date_to?: string;
  route_id?: number;
  waypoint_id?: number;
  user_id?: number;
  period?: { start: string; end: string }; // MM-DD, start on or before end
  rating?: { system: OutingRatingField; min?: string; max?: string };
  condition_at_least?: ConditionRating;
  elevation_max?: { min?: number; max?: number };
  height_diff_up?: { min?: number; max?: number };
  limit?: number; // default DEFAULT_LIMIT
  offset?: number; // default 0
  lang?: Lang; // sent as pl, default DEFAULT_LANG
  // Sort `-date_end,-id` instead of `-date_end`: outings ending the same day otherwise come back in an
  // arbitrary order, which can differ from one page to the next, so paging could skip or repeat one.
  tiebreak_by_id?: boolean;
}

export async function searchOutings(params: OutingSearchParams = {}): Promise<OutingListResponse> {
  const search = new URLSearchParams();
  // `q=` (empty) returns every outing, so only send a non-empty keyword.
  if (params.query) search.set("q", params.query);
  if (params.area_id !== undefined) search.set("a", String(params.area_id));
  if (params.activity !== undefined) search.set("act", params.activity);
  if (params.rating !== undefined) {
    const range = rangeParam(params.rating.min, params.rating.max);
    if (range !== undefined) search.set(ROUTE_RATING_PARAMS[params.rating.system], range);
  }
  // Conditions go from excellent down to awful, and `ocond=v` alone matches every outing with a condition:
  // "v or better" is the range excellent → v.
  if (params.condition_at_least !== undefined) search.set("ocond", `excellent,${params.condition_at_least}`);
  const elevationMax = rangeParam(params.elevation_max?.min, params.elevation_max?.max);
  if (elevationMax !== undefined) search.set("oalt", elevationMax);
  const heightDiffUp = rangeParam(params.height_diff_up?.min, params.height_diff_up?.max);
  if (heightDiffUp !== undefined) search.set("odif", heightDiffUp);
  if (params.date_from !== undefined || params.date_to !== undefined) {
    search.set("date", `${params.date_from ?? DATE_MIN},${params.date_to ?? DATE_MAX}`);
  }
  if (params.period !== undefined) {
    search.set("period", `${PERIOD_YEAR}-${params.period.start},${PERIOD_YEAR}-${params.period.end}`);
  }
  if (params.route_id !== undefined) search.set("r", String(params.route_id));
  if (params.waypoint_id !== undefined) search.set("w", String(params.waypoint_id));
  if (params.user_id !== undefined) search.set("u", String(params.user_id));
  search.set("sort", params.tiebreak_by_id === true ? "-date_end,-id" : "-date_end");
  search.set("limit", String(params.limit ?? DEFAULT_LIMIT));
  search.set("offset", String(params.offset ?? 0));
  search.set("pl", params.lang ?? DEFAULT_LANG);
  return getJson({ path: "/outings", params: search, schema: outingListResponseSchema });
}

export async function searchBooks(options: BookSearchOptions): Promise<BookSearchResponse> {
  const params = keywordParams(options);
  if (options.book_type !== undefined) params.set("btyp", options.book_type);
  if (options.activity !== undefined) params.set("act", options.activity);
  return getJson({ path: "/books", params, schema: bookSearchResponseSchema });
}

export async function getBook(id: number): Promise<BookDetail> {
  return getJson({ path: `/books/${id}`, document: { type: "book", id }, schema: bookDetailSchema });
}

export async function searchArticles(options: ArticleSearchOptions): Promise<ArticleSearchResponse> {
  const params = keywordParams(options);
  if (options.category !== undefined) params.set("acat", options.category);
  if (options.article_type !== undefined) params.set("atyp", options.article_type);
  if (options.activity !== undefined) params.set("act", options.activity);
  return getJson({ path: "/articles", params, schema: articleSearchResponseSchema });
}

export async function getArticle(id: number): Promise<ArticleDetail> {
  return getJson({ path: `/articles/${id}`, document: { type: "article", id }, schema: articleDetailSchema });
}
