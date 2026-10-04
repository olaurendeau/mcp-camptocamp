import { describe, it, expect } from "vitest";
import { RATING_DISPLAY, ROUTE_RATING_SYSTEMS, formatRatingParts, formatRatingLines } from "../../src/tools/ratings.js";
import { ROUTE_RATING_FIELDS } from "../../src/api/values.js";
import type { RatingFields } from "../../src/api/schemas.js";
import { BARE_RATING } from "./bare-rating.js";

// One value per R4 field, distinct so that each fragment shows which field it came from.
const everyRating: Required<RatingFields> = {
  ski_rating: "4.1",
  ski_exposition: "E2",
  labande_ski_rating: "S4",
  labande_global_rating: "AD",
  global_rating: "F",
  engagement_rating: "II",
  risk_rating: "X1",
  equipment_rating: "P1",
  rock_free_rating: "5b",
  rock_required_rating: "5a",
  exposition_rock_rating: "E1",
  aid_rating: "A0",
  ice_rating: "3+",
  mixed_rating: "M4",
  via_ferrata_rating: "K2",
  hiking_rating: "T2",
  hiking_mtb_exposition: "E3",
  snowshoe_rating: "R1",
  mtb_up_rating: "M2",
  mtb_down_rating: "V3",
};

describe("RATING_DISPLAY", () => {
  it("covers every rating field of the route search once", () => {
    const fields = RATING_DISPLAY.flatMap((rating) => rating.fields);
    expect([...fields].sort()).toEqual([...ROUTE_RATING_FIELDS].sort());
  });

  it("never uses the bare label Rating", () => {
    for (const { label } of RATING_DISPLAY) expect(label).not.toBe("Rating");
  });
});

describe("formatRatingParts", () => {
  it("labels every rating by its system, in the decided order (Q1 on #58)", () => {
    expect(formatRatingParts(everyRating)).toEqual([
      "Ski rating (Toponeige): 4.1",
      "Ski exposure: E2",
      "Labande: S4 / AD",
      "Global rating: F",
      "Engagement: II",
      "Risk rating: X1",
      "Equipment: P1",
      "Rock free rating: 5b",
      "Rock required rating: 5a",
      "Rock exposure: E1",
      "Aid rating: A0",
      "Ice rating: 3+",
      "Mixed rating: M4",
      "Via ferrata rating: K2",
      "Hiking rating: T2",
      "Hiking/MTB exposure: E3",
      "Snowshoe rating: R1",
      "MTB up rating: M2",
      "MTB down rating: V3",
    ]);
  });

  it("returns no fragment when every rating is missing, null or empty", () => {
    expect(formatRatingParts({})).toEqual([]);
    const nulls = Object.fromEntries(ROUTE_RATING_FIELDS.map((field) => [field, null]));
    expect(formatRatingParts(nulls)).toEqual([]);
    const empties = Object.fromEntries(ROUTE_RATING_FIELDS.map((field) => [field, ""]));
    expect(formatRatingParts(empties)).toEqual([]);
  });

  it("prints whichever Labande half exists", () => {
    expect(formatRatingParts({ labande_ski_rating: "S4", labande_global_rating: "AD" })).toEqual(["Labande: S4 / AD"]);
    expect(formatRatingParts({ labande_ski_rating: "S4" })).toEqual(["Labande: S4"]);
    expect(formatRatingParts({ labande_ski_rating: "S4", labande_global_rating: null })).toEqual(["Labande: S4"]);
    expect(formatRatingParts({ labande_global_rating: "AD" })).toEqual(["Labande: AD"]);
  });

  it("prints the ski ratings of route 55195 before its global rating", () => {
    // Ratings of route 55195 (Roccia Nera : Versant SW) in GET /routes?q=voie normale&pl=fr (2026-10-04).
    const parts = formatRatingParts({
      ski_rating: "4.1",
      ski_exposition: "E4",
      global_rating: "F",
      engagement_rating: "II",
    });
    expect(parts.join(" | ")).toBe(
      "Ski rating (Toponeige): 4.1 | Ski exposure: E4 | Global rating: F | Engagement: II",
    );
  });
});

describe("formatRatingLines", () => {
  it("writes one bold-labelled line per rating", () => {
    // Ratings of route 54085 in GET /routes/54085 (2026-10-04).
    expect(
      formatRatingLines({
        ski_rating: "4.1",
        ski_exposition: "E2",
        labande_ski_rating: "S4",
        labande_global_rating: "AD",
      }),
    ).toEqual(["**Ski rating (Toponeige)**: 4.1", "**Ski exposure**: E2", "**Labande**: S4 / AD"]);
  });

  it("returns no line without ratings", () => {
    expect(formatRatingLines({})).toEqual([]);
  });
});

describe("ROUTE_RATING_SYSTEMS", () => {
  it("has a filter label and a scale for every rating search parameter", () => {
    expect(Object.keys(ROUTE_RATING_SYSTEMS).sort()).toEqual([...ROUTE_RATING_FIELDS].sort());
  });

  it("holds Camptocamp's scales, easiest first (c2corg v6_common attributes.py)", () => {
    const lengths = Object.fromEntries(
      Object.entries(ROUTE_RATING_SYSTEMS).map(([field, { scale }]) => [field, scale.length]),
    );
    expect(lengths).toEqual({
      ski_rating: 18,
      global_rating: 21,
      labande_global_rating: 21,
      labande_ski_rating: 7,
      ski_exposition: 4,
      engagement_rating: 6,
      risk_rating: 5,
      equipment_rating: 8,
      ice_rating: 12,
      mixed_rating: 22,
      exposition_rock_rating: 6,
      rock_free_rating: 37,
      rock_required_rating: 37,
      aid_rating: 12,
      via_ferrata_rating: 6,
      hiking_rating: 5,
      hiking_mtb_exposition: 4,
      snowshoe_rating: 5,
      mtb_up_rating: 5,
      mtb_down_rating: 5,
    });
    expect(ROUTE_RATING_SYSTEMS.global_rating.scale.join(", ")).toBe(
      "F, F+, PD-, PD, PD+, AD-, AD, AD+, D-, D, D+, TD-, TD, TD+, ED-, ED, ED+, ED4, ED5, ED6, ED7",
    );
    expect(ROUTE_RATING_SYSTEMS.ski_rating.scale.join(", ")).toBe(
      "1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6",
    );
    expect(ROUTE_RATING_SYSTEMS.rock_free_rating.scale.slice(0, 9)).toEqual([
      "2",
      "3a",
      "3b",
      "3c",
      "4a",
      "4b",
      "4c",
      "5a",
      "5a+",
    ]);
    expect(ROUTE_RATING_SYSTEMS.rock_free_rating.scale.at(-1)).toBe("9c+");
    expect(ROUTE_RATING_SYSTEMS.mixed_rating.scale.at(-1)).toBe("M12+");
  });

  it("names each system as the R4 labels do, for the Filters line", () => {
    expect(ROUTE_RATING_SYSTEMS.ski_rating.label).toBe("ski rating (Toponeige)");
    expect(ROUTE_RATING_SYSTEMS.labande_ski_rating.label).toBe("Labande ski rating");
    expect(ROUTE_RATING_SYSTEMS.hiking_mtb_exposition.label).toBe("hiking/MTB exposure");
    for (const { label } of Object.values(ROUTE_RATING_SYSTEMS)) expect(label).not.toMatch(/^rating$/i);
  });
});

describe("BARE_RATING", () => {
  it("catches the unqualified label in a search line and in a detail", () => {
    expect("- [1] Sortie | 2026-07-01 | Rating: PD").toMatch(BARE_RATING);
    expect("Rating: PD").toMatch(BARE_RATING);
    expect("**Rating**: PD").toMatch(BARE_RATING);
  });

  it("lets system labels through", () => {
    expect("- [1] Sortie | Global rating: PD | Rock free rating: 5b | MTB up rating: M2").not.toMatch(BARE_RATING);
    expect("**Global rating**: PD\n**Ski rating (Toponeige)**: 4.1").not.toMatch(BARE_RATING);
  });
});
