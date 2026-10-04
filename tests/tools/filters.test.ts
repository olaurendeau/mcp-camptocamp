import { describe, it, expect } from "vitest";
import {
  describeRange,
  heightDiffUp,
  rangeFilter,
  ratingBound,
  ratingFilter,
  ratingScales,
} from "../../src/tools/filters.js";

const SYSTEMS = ["ski_rating", "global_rating", "mtb_down_rating"] as const;
const GLOBAL_SCALE = "F, F+, PD-, PD, PD+, AD-, AD, AD+, D-, D, D+, TD-, TD, TD+, ED-, ED, ED+, ED4, ED5, ED6, ED7";

describe("describeRange", () => {
  it.each<[string | number | undefined, string | number | undefined, string, string]>([
    ["3.1", "4.1", "", "3.1 → 4.1"],
    ["AD", undefined, "", "from AD"],
    [undefined, "T2", "", "up to T2"],
    [1000, 1500, "m", "1000 → 1500m"],
    [1000, undefined, "m", "from 1000m"],
    [undefined, 0, "m", "up to 0m"],
  ])("describes %j → %j (unit %j) as %j", (min, max, unit, text) => {
    expect(describeRange(min, max, unit)).toBe(text);
  });
});

describe("ratingFilter", () => {
  it("returns only the bounds given", () => {
    expect(ratingFilter({ rating_system: "ski_rating", rating_min: "3.1", rating_max: "4.1" }, SYSTEMS)).toEqual({
      system: "ski_rating",
      min: "3.1",
      max: "4.1",
    });
    expect(ratingFilter({ rating_system: "global_rating", rating_min: "AD" }, SYSTEMS)).toEqual({
      system: "global_rating",
      min: "AD",
    });
    expect(ratingFilter({ rating_system: "global_rating", rating_max: "AD" }, SYSTEMS)).toEqual({
      system: "global_rating",
      max: "AD",
    });
  });

  it("returns nothing without a system or bounds", () => {
    expect(ratingFilter({}, SYSTEMS)).toBeUndefined();
  });

  it("accepts equal bounds and the ends of a scale", () => {
    expect(ratingFilter({ rating_system: "global_rating", rating_min: "F", rating_max: "ED7" }, SYSTEMS)).toEqual({
      system: "global_rating",
      min: "F",
      max: "ED7",
    });
    expect(ratingFilter({ rating_system: "ski_rating", rating_min: "4.1", rating_max: "4.1" }, SYSTEMS)).toEqual({
      system: "ski_rating",
      min: "4.1",
      max: "4.1",
    });
  });

  it.each<[string, Parameters<typeof ratingFilter<(typeof SYSTEMS)[number]>>[0], string]>([
    [
      "a bound without a system, listing the systems passed in",
      { rating_min: "AD" },
      "rating_min and rating_max need a rating_system, one of: ski_rating, global_rating, mtb_down_rating",
    ],
    [
      "rating_max without a system",
      { rating_max: "AD" },
      "rating_min and rating_max need a rating_system, one of: ski_rating, global_rating, mtb_down_rating",
    ],
    [
      "a system without bounds",
      { rating_system: "global_rating" },
      "rating_system needs rating_min, rating_max or both",
    ],
    [
      "an off-scale rating_min",
      { rating_system: "global_rating", rating_min: "XX" },
      `rating_min "XX" is not a valid global_rating value; valid values: ${GLOBAL_SCALE}`,
    ],
    [
      "an off-scale rating_max",
      { rating_system: "global_rating", rating_min: "AD", rating_max: "4.1" },
      `rating_max "4.1" is not a valid global_rating value; valid values: ${GLOBAL_SCALE}`,
    ],
    [
      "a value of another system",
      { rating_system: "mtb_down_rating", rating_min: "M1" },
      'rating_min "M1" is not a valid mtb_down_rating value; valid values: V1, V2, V3, V4, V5',
    ],
    [
      "a bound with a quote and a line break, quoted on one line",
      { rating_system: "mtb_down_rating", rating_max: 'V1"\nV2' },
      'rating_max "V1\\"\\nV2" is not a valid mtb_down_rating value; valid values: V1, V2, V3, V4, V5',
    ],
    [
      "reversed bounds",
      { rating_system: "ski_rating", rating_min: "4.2", rating_max: "3.1" },
      "rating_min must not be above rating_max",
    ],
  ])("rejects %s", (_label, input, message) => {
    expect(() => ratingFilter(input, SYSTEMS)).toThrow(new Error(message));
  });
});

describe("rangeFilter", () => {
  const NAMES = ["max_elevation_min", "max_elevation_max"] as const;

  it("returns only the bounds given", () => {
    expect(rangeFilter(3000, 4000, NAMES)).toEqual({ min: 3000, max: 4000 });
    expect(rangeFilter(3000, undefined, NAMES)).toEqual({ min: 3000 });
    expect(rangeFilter(undefined, 0, NAMES)).toEqual({ max: 0 });
    expect(rangeFilter(1000, 1000, NAMES)).toEqual({ min: 1000, max: 1000 });
  });

  it("returns nothing without bounds", () => {
    expect(rangeFilter(undefined, undefined, NAMES)).toBeUndefined();
  });

  it("rejects reversed bounds with the field names passed in", () => {
    expect(() => rangeFilter(4000, 3000, NAMES)).toThrow(
      new Error("max_elevation_min must not be above max_elevation_max"),
    );
    expect(() => rangeFilter(1500, 1000, ["height_diff_up_min", "height_diff_up_max"])).toThrow(
      new Error("height_diff_up_min must not be above height_diff_up_max"),
    );
  });
});

describe("input factories", () => {
  it("ratingBound caps a value at 8 characters", () => {
    const bound = ratingBound("Easiest rating");
    expect(bound.description).toBe("Easiest rating");
    expect(bound.safeParse("M12+").success).toBe(true);
    expect(bound.safeParse("AD".repeat(5)).success).toBe(false);
    expect(bound.safeParse(undefined).success).toBe(true);
  });

  it("heightDiffUp names the documents a missing elevation gain excludes", () => {
    const bound = heightDiffUp("Lowest", "outings");
    expect(bound.description).toBe(
      "Lowest elevation gain in metres, inclusive (outings without an elevation gain are excluded)",
    );
    expect(bound.safeParse(0).success).toBe(true);
    expect(bound.safeParse(-1).success).toBe(false);
    expect(bound.safeParse(1.5).success).toBe(false);
  });

  it("ratingScales lists the scale of each system passed in", () => {
    expect(ratingScales(["mtb_down_rating", "hiking_rating"])).toBe(
      "mtb_down_rating: V1, V2, V3, V4, V5; hiking_rating: T1, T2, T3, T4, T5",
    );
  });
});
