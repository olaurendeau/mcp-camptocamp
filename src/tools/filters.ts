// Rating and range filters shared by search_routes and search_outings: their inputs, the checks the API
// does not make (R7 of #58: it silently ignores an off-scale bound), and their text in the Filters line.
import { z } from "zod";
import type { RouteRatingField } from "../api/camptocamp.js";
import { ROUTE_RATING_SYSTEMS } from "./ratings.js";
import { quote } from "./paging.js";

// The longest scale value is 4 characters ("M12+"); the cap keeps an invalid value short in the error that echoes it.
const MAX_RATING_LENGTH = 8;

/** A rating_min or rating_max input: a value from the scale of rating_system, checked by `ratingFilter`. */
export function ratingBound(description: string) {
  return z.string().max(MAX_RATING_LENGTH).optional().describe(description);
}

/** A height_diff_up_min or _max input; `documents` names what a missing elevation gain excludes ("routes"). */
export function heightDiffUp(bound: string, documents: string) {
  return z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(`${bound} elevation gain in metres, inclusive (${documents} without an elevation gain are excluded)`);
}

/** "ski_rating: 1.1, 1.2, …; global_rating: F, F+, …": the scale of each system, for a rating_system description. */
export function ratingScales(systems: readonly RouteRatingField[]): string {
  return systems.map((system) => `${system}: ${ROUTE_RATING_SYSTEMS[system].scale.join(", ")}`).join("; ");
}

/** "3.1 → 4.1", "from 3.1" or "up to 4.1", with `unit` after each number. */
export function describeRange(min: string | number | undefined, max: string | number | undefined, unit = ""): string {
  if (min !== undefined && max !== undefined) return `${min} → ${max}${unit}`;
  return min !== undefined ? `from ${min}${unit}` : `up to ${String(max)}${unit}`;
}

export interface RatingInput<S extends RouteRatingField> {
  rating_system?: S | undefined;
  rating_min?: string | undefined;
  rating_max?: string | undefined;
}

export interface RatingRange<S extends RouteRatingField> {
  system: S;
  min?: string;
  max?: string;
}

/**
 * The rating filter of `input`, or undefined when it has none. Throws before any request on a bound without
 * a system (listing `systems`), a system without bounds, an off-scale bound or min above max.
 */
export function ratingFilter<S extends RouteRatingField>(
  input: RatingInput<S>,
  systems: readonly S[],
): RatingRange<S> | undefined {
  const { rating_system: system, rating_min: min, rating_max: max } = input;
  if (system === undefined) {
    if (min !== undefined || max !== undefined) {
      throw new Error(`rating_min and rating_max need a rating_system, one of: ${systems.join(", ")}`);
    }
    return undefined;
  }
  if (min === undefined && max === undefined) {
    throw new Error("rating_system needs rating_min, rating_max or both");
  }

  const { scale } = ROUTE_RATING_SYSTEMS[system];
  for (const [name, value] of [
    ["rating_min", min],
    ["rating_max", max],
  ] as const) {
    if (value !== undefined && !scale.includes(value)) {
      throw new Error(`${name} ${quote(value)} is not a valid ${system} value; valid values: ${scale.join(", ")}`);
    }
  }
  if (min !== undefined && max !== undefined && scale.indexOf(min) > scale.indexOf(max)) {
    throw new Error("rating_min must not be above rating_max");
  }
  return { system, ...(min !== undefined && { min }), ...(max !== undefined && { max }) };
}

/** A numeric `{min?, max?}` range, or undefined when neither bound is given; throws when min is above max. */
export function rangeFilter(
  min: number | undefined,
  max: number | undefined,
  [minName, maxName]: readonly [string, string],
): { min?: number; max?: number } | undefined {
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error(`${minName} must not be above ${maxName}`);
  }
  if (min === undefined && max === undefined) return undefined;
  return { ...(min !== undefined && { min }), ...(max !== undefined && { max }) };
}
