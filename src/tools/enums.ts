// Camptocamp's closed lists of values, verbatim from c2corg v6_common attributes.py.
// - Filter values: the API silently ignores a value outside them (`conf=nonsense` in area 14409 returns all
//   1128 routes), so every enum input is checked against its list before any request (rule R7 of #58).
// - Displayed values: printed verbatim, so a value Camptocamp adds later still shows; their meanings are
//   given in tool descriptions only.
import { z } from "zod";

export const ACTIVITIES = [
  "skitouring",
  "snow_ice_mixed",
  "mountain_climbing",
  "rock_climbing",
  "ice_climbing",
  "hiking",
  "snowshoeing",
  "paragliding",
  "mountain_biking",
  "via_ferrata",
  "slacklining",
] as const;

export const ROUTE_TYPES = ["return_same_way", "loop", "loop_hut", "traverse", "raid", "expedition"] as const;

export const ROUTE_CONFIGURATIONS = ["edge", "pillar", "face", "corridor", "goulotte", "glacier"] as const;

export const WAYPOINT_TYPES = [
  "summit",
  "pass",
  "lake",
  "waterfall",
  "locality",
  "bisse",
  "canyon",
  "access",
  "climbing_outdoor",
  "climbing_indoor",
  "hut",
  "gite",
  "shelter",
  "bivouac",
  "camp_site",
  "base_camp",
  "local_product",
  "paragliding_takeoff",
  "paragliding_landing",
  "cave",
  "waterpoint",
  "weather_station",
  "webcam",
  "virtual",
  "slackline_spot",
  "misc",
] as const;

export const BOOK_TYPES = [
  "topo",
  "environment",
  "historical",
  "biography",
  "photos-art",
  "novel",
  "technics",
  "tourism",
  "magazine",
] as const;

// Outing conditions, best first (v6_common condition_ratings).
export const CONDITION_RATINGS = ["excellent", "good", "average", "poor", "awful"] as const;
export type ConditionRating = (typeof CONDITION_RATINGS)[number];

/** One value of `values`; anything else fails with "must be one of: <values>". */
export function enumValue<T extends string>(values: readonly [T, ...T[]]) {
  return z.enum(values, { errorMap: () => ({ message: `must be one of: ${values.join(", ")}` }) });
}

// A waypoint's custodianship (displayed, used in get_waypoint's description). The values come from
// v6_common's custodianship_types; their meanings translate Camptocamp's own labels (c2c_ui
// src/translations/fr.json, "custodianship_types" context).
export const CUSTODIANSHIPS = {
  accessible_when_wardened: "wardened, closed outside the wardened period",
  always_accessible: "always open, wardened or not",
  key_needed: "a key is needed to open it",
  no_warden: "not wardened",
} as const;
