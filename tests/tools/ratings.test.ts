import { describe, it, expect } from "vitest";
import { RATING_DISPLAY, formatRatingParts, formatRatingLines } from "../../src/tools/ratings.js";
import { ROUTE_RATING_FIELDS } from "../../src/api/camptocamp.js";
import type { RatingFields } from "../../src/api/schemas.js";

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
