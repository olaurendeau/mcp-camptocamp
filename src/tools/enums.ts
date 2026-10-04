// Camptocamp's closed lists of filter values, verbatim from c2corg v6_common attributes.py. The API silently
// ignores a value outside them (`conf=nonsense` in area 14409 returns all 1128 routes), so every enum input is
// checked against its list before any request (rule R7 of #58).
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

/** One value of `values`; anything else fails with "must be one of: <values>". */
export function enumValue<T extends string>(values: readonly [T, ...T[]]) {
  return z.enum(values, { errorMap: () => ({ message: `must be one of: ${values.join(", ")}` }) });
}
