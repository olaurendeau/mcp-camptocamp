// The closed lists of values the API client sends, apart from the client itself: tool test files auto-mock
// src/api/camptocamp.ts, and vitest empties exported arrays when auto-mocking, so a list exported from there
// would be [] in those tests (#200). Import these lists and their types from this module, never through the client.

// The languages of Camptocamp documents: exactly those the API accepts as `pl` (`ru`, `pt`, `nl` → 400; #141 on #153).
export const LANGS = ["fr", "en", "de", "it", "es", "ca", "eu", "sl", "zh"] as const;
export type Lang = (typeof LANGS)[number];

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

// The 12 rating systems the outing search filters on, with the same parameters as routes (v6_api's outing
// search mapping). The API silently ignores the 8 others (`srat`, `sexpo`, … return the unfiltered total).
export const OUTING_RATING_FIELDS = [
  "ski_rating",
  "labande_global_rating",
  "global_rating",
  "engagement_rating",
  "equipment_rating",
  "ice_rating",
  "rock_free_rating",
  "via_ferrata_rating",
  "hiking_rating",
  "snowshoe_rating",
  "mtb_up_rating",
  "mtb_down_rating",
] as const satisfies readonly RouteRatingField[];
export type OutingRatingField = (typeof OUTING_RATING_FIELDS)[number];

// Outing conditions, best first (v6_common condition_ratings); `ocond` takes a range of them.
export const CONDITION_RATINGS = ["excellent", "good", "average", "poor", "awful"] as const;
export type ConditionRating = (typeof CONDITION_RATINGS)[number];
