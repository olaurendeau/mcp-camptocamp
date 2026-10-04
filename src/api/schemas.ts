import { z } from "zod";

// Camptocamp API v6 response shapes: the one place response types are declared (camptocamp.ts
// re-exports them under these names). Only the fields a formatter dereferences are required;
// every other field is `.nullish()` because the API sends null for unset values (route 53914:
// height_diff_down, risk_rating…) and leaves some fields out of list items. Plain `z.object`
// strips unknown keys. These schemas are not parsed at runtime yet: the types only.

// Shared parts

export const localeSchema = z.object({
  lang: z.string(),
  title: z.string(),
});
export type Locale = z.infer<typeof localeSchema>;

export const titledAssociationSchema = z.object({
  document_id: z.number(),
  locales: z.array(localeSchema),
});
export type TitledAssociation = z.infer<typeof titledAssociationSchema>;

// Route locales also carry the summit name, shown as "prefix : title" in association lines.
const routeLocaleSchema = localeSchema.extend({ title_prefix: z.string().nullish() });

export const routeAssociationSchema = z.object({
  document_id: z.number(),
  locales: z.array(routeLocaleSchema),
});
export type RouteAssociation = z.infer<typeof routeAssociationSchema>;

export const waypointAssociationSchema = titledAssociationSchema.extend({
  waypoint_type: z.string(),
  elevation: z.number().nullish(),
});
export type WaypointAssociation = z.infer<typeof waypointAssociationSchema>;

export const areaSummarySchema = titledAssociationSchema.extend({
  area_type: z.string(), // printed verbatim, never narrowed or translated
  available_langs: z.array(z.string()).nullish(),
});
export type AreaSummary = z.infer<typeof areaSummarySchema>;

// The formatters print both fields of an author when there is one.
export const authorSchema = z.object({
  name: z.string(),
  user_id: z.number(),
});

function searchResponseSchema<T extends z.ZodTypeAny>(document: T) {
  return z.object({ documents: z.array(document), total: z.number() });
}

// Routes

export const routeSearchResultSchema = z.object({
  document_id: z.number(),
  locales: z.array(routeLocaleSchema),
  activities: z.array(z.string()),
  elevation_max: z.number().nullish(),
  height_diff_difficulties: z.number().nullish(),
  rock_free_rating: z.string().nullish(),
  global_rating: z.string().nullish(),
});
export const routeSearchResponseSchema = searchResponseSchema(routeSearchResultSchema);

export const routeDetailSchema = z.object({
  document_id: z.number(),
  locales: z.array(
    localeSchema.extend({
      description: z.string().nullish(),
      remarks: z.string().nullish(),
      gear: z.string().nullish(),
      route_history: z.string().nullish(),
    }),
  ),
  activities: z.array(z.string()),
  elevation_max: z.number().nullish(),
  elevation_min: z.number().nullish(),
  height_diff_up: z.number().nullish(),
  height_diff_down: z.number().nullish(),
  rock_free_rating: z.string().nullish(),
  rock_required_rating: z.string().nullish(),
  global_rating: z.string().nullish(),
  engagement_rating: z.string().nullish(),
  equipment_rating: z.string().nullish(),
  // Not displayed yet; typed because the live API sends them, often as null.
  risk_rating: z.string().nullish(),
  exposition_rock_rating: z.string().nullish(),
  aid_rating: z.string().nullish(),
  durations: z.array(z.string()).nullish(),
  main_waypoint_id: z.number().nullish(),
  geometry: z.object({ geom_detail: z.string().nullish() }).nullish(),
  areas: z.array(areaSummarySchema).nullish(),
});

// Waypoints

export const waypointSearchResultSchema = z.object({
  document_id: z.number(),
  locales: z.array(localeSchema),
  waypoint_type: z.string(),
  elevation: z.number().nullish(),
});
export const waypointSearchResponseSchema = searchResponseSchema(waypointSearchResultSchema);

export const waypointDetailSchema = z.object({
  document_id: z.number(),
  locales: z.array(
    localeSchema.extend({
      description: z.string().nullish(),
      access: z.string().nullish(),
    }),
  ),
  waypoint_type: z.string(),
  elevation: z.number().nullish(),
  geometry: z.object({ geom: z.string().nullish() }).nullish(), // GeoJSON Point as a string
  areas: z.array(areaSummarySchema).nullish(),
});

// Outings

// Items of GET /outings?u={user_id} (search_user_outings)
export const outingSearchResultSchema = z.object({
  document_id: z.number(),
  locales: z.array(localeSchema),
  activities: z.array(z.string()),
  date_start: z.string().nullish(),
  date_end: z.string().nullish(),
  elevation_max: z.number().nullish(),
  height_diff_up: z.number().nullish(),
  global_rating: z.string().nullish(),
  hiking_rating: z.string().nullish(),
  rock_free_rating: z.string().nullish(),
  author: authorSchema.nullish(),
});
export const outingSearchResponseSchema = searchResponseSchema(outingSearchResultSchema);

export const outingDetailSchema = z.object({
  document_id: z.number(),
  locales: z.array(
    localeSchema.extend({
      description: z.string().nullish(),
      conditions: z.string().nullish(),
      participants: z.string().nullish(),
      route_description: z.string().nullish(),
      timing: z.string().nullish(),
      weather: z.string().nullish(),
    }),
  ),
  activities: z.array(z.string()),
  date_start: z.string().nullish(),
  date_end: z.string().nullish(),
  elevation_max: z.number().nullish(),
  elevation_min: z.number().nullish(),
  height_diff_up: z.number().nullish(),
  height_diff_down: z.number().nullish(),
  global_rating: z.string().nullish(),
  engagement_rating: z.string().nullish(),
  equipment_rating: z.string().nullish(),
  hiking_rating: z.string().nullish(),
  rock_free_rating: z.string().nullish(),
  condition_rating: z.string().nullish(),
  participant_count: z.number().nullish(),
  author: authorSchema.nullish(),
  associations: z.object({ routes: z.array(titledAssociationSchema).nullish() }).nullish(),
});

// Items of GET /outings?sort=-date_end… (search_outings); only range areas are listed, by area_type.
export const outingListItemSchema = z.object({
  document_id: z.number(),
  locales: z.array(localeSchema),
  activities: z.array(z.string()),
  date_start: z.string().nullish(),
  date_end: z.string().nullish(),
  condition_rating: z.string().nullish(),
  elevation_max: z.number().nullish(),
  height_diff_up: z.number().nullish(),
  global_rating: z.string().nullish(),
  ski_rating: z.string().nullish(),
  labande_global_rating: z.string().nullish(),
  rock_free_rating: z.string().nullish(),
  ice_rating: z.string().nullish(),
  hiking_rating: z.string().nullish(),
  snowshoe_rating: z.string().nullish(),
  areas: z.array(titledAssociationSchema.extend({ area_type: z.string().nullish() })).nullish(),
  author: authorSchema.nullish(),
});
export const outingListResponseSchema = searchResponseSchema(outingListItemSchema);

// Areas

export const areaSearchResultSchema = areaSummarySchema;
export const areaSearchResponseSchema = searchResponseSchema(areaSearchResultSchema);

export const areaDetailSchema = z.object({
  document_id: z.number(),
  area_type: z.string(),
  locales: z.array(
    localeSchema.extend({
      summary: z.string().nullish(),
      description: z.string().nullish(),
    }),
  ),
  // Typed for fixtures only; never displayed.
  geometry: z.object({ geom: z.string().nullish(), geom_detail: z.string().nullish() }).nullish(),
});

// Books

export const bookSearchResultSchema = z.object({
  document_id: z.number(),
  locales: z.array(localeSchema.extend({ summary: z.string().nullish() })),
  author: z.string().nullish(),
  activities: z.array(z.string()).nullish(),
  book_types: z.array(z.string()).nullish(),
  available_langs: z.array(z.string()).nullish(),
  quality: z.string().nullish(),
});
export const bookSearchResponseSchema = searchResponseSchema(bookSearchResultSchema);

export const bookDetailSchema = z.object({
  document_id: z.number(),
  locales: z.array(
    localeSchema.extend({
      summary: z.string().nullish(),
      description: z.string().nullish(),
    }),
  ),
  author: z.string().nullish(),
  editor: z.string().nullish(),
  isbn: z.string().nullish(),
  url: z.string().nullish(),
  nb_pages: z.number().nullish(),
  publication_date: z.string().nullish(),
  langs: z.array(z.string()).nullish(), // languages the book is published in
  available_langs: z.array(z.string()).nullish(), // languages of the Camptocamp page; never displayed
  activities: z.array(z.string()).nullish(),
  book_types: z.array(z.string()).nullish(),
  associations: z
    .object({
      routes: z.array(routeAssociationSchema).nullish(),
      waypoints: z.array(waypointAssociationSchema).nullish(),
      articles: z.array(titledAssociationSchema).nullish(),
    })
    .nullish(),
});

// Articles

export const articleSearchResultSchema = z.object({
  document_id: z.number(),
  locales: z.array(localeSchema.extend({ summary: z.string().nullish() })),
  article_type: z.string().nullish(), // "collab" | "personal", printed verbatim
  categories: z.array(z.string()).nullish(),
  activities: z.array(z.string()).nullish(),
  quality: z.string().nullish(),
});
export const articleSearchResponseSchema = searchResponseSchema(articleSearchResultSchema);

// images, users and xreports associations are left out on purpose: no tool can follow them.
export const articleDetailSchema = z.object({
  document_id: z.number(),
  locales: z.array(
    localeSchema.extend({
      summary: z.string().nullish(),
      description: z.string().nullish(),
    }),
  ),
  article_type: z.string().nullish(),
  categories: z.array(z.string()).nullish(),
  activities: z.array(z.string()).nullish(),
  quality: z.string().nullish(),
  author: authorSchema.nullish(),
  associations: z
    .object({
      routes: z.array(routeAssociationSchema).nullish(),
      waypoints: z.array(waypointAssociationSchema).nullish(),
      articles: z.array(titledAssociationSchema).nullish(),
      outings: z.array(titledAssociationSchema).nullish(),
      books: z.array(titledAssociationSchema).nullish(),
    })
    .nullish(),
});

// Response types, re-exported by camptocamp.ts

export type RouteSearchResult = z.infer<typeof routeSearchResultSchema>;
export type RouteSearchResponse = z.infer<typeof routeSearchResponseSchema>;
export type RouteDetail = z.infer<typeof routeDetailSchema>;
export type WaypointSearchResult = z.infer<typeof waypointSearchResultSchema>;
export type WaypointSearchResponse = z.infer<typeof waypointSearchResponseSchema>;
export type WaypointDetail = z.infer<typeof waypointDetailSchema>;
export type OutingSearchResult = z.infer<typeof outingSearchResultSchema>;
export type OutingSearchResponse = z.infer<typeof outingSearchResponseSchema>;
export type OutingDetail = z.infer<typeof outingDetailSchema>;
export type OutingListItem = z.infer<typeof outingListItemSchema>;
export type OutingListResponse = z.infer<typeof outingListResponseSchema>;
export type AreaSearchResult = z.infer<typeof areaSearchResultSchema>;
export type AreaSearchResponse = z.infer<typeof areaSearchResponseSchema>;
export type AreaDetail = z.infer<typeof areaDetailSchema>;
export type BookSearchResult = z.infer<typeof bookSearchResultSchema>;
export type BookSearchResponse = z.infer<typeof bookSearchResponseSchema>;
export type BookDetail = z.infer<typeof bookDetailSchema>;
export type ArticleSearchResult = z.infer<typeof articleSearchResultSchema>;
export type ArticleSearchResponse = z.infer<typeof articleSearchResponseSchema>;
export type ArticleDetail = z.infer<typeof articleDetailSchema>;
