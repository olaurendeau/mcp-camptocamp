import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleSearchUserOutings,
  handleGetOuting,
  handleSearchOutings,
  outingToolDefinitions,
  searchOutingsSchema,
} from "../../src/tools/outings.js";
import type { z } from "zod";
import * as api from "../../src/api/camptocamp.js";
import type { OutingListItem, OutingListResponse } from "../../src/api/camptocamp.js";
import { outingDetailSchema, outingListResponseSchema, outingSearchResponseSchema } from "../../src/api/schemas.js";
import { throughSchema } from "./through-schema.js";

vi.mock("../../src/api/camptocamp.js");

const mockSearchUserOutings = throughSchema(vi.mocked(api.searchUserOutings), outingSearchResponseSchema);
const mockGetOuting = throughSchema(vi.mocked(api.getOuting), outingDetailSchema);
const mockSearchOutings = throughSchema(vi.mocked(api.searchOutings), outingListResponseSchema);

beforeEach(() => {
  vi.clearAllMocks();
});

// The bare label "Rating:" (rule R4 of #58) must not appear; "Global rating:", "**Global rating**:" may.
const BARE_RATING = /(^|[^a-z) ])Rating: /m;

describe("handleSearchUserOutings", () => {
  it("formats results correctly", async () => {
    mockSearchUserOutings.mockResolvedValueOnce({
      total: 2,
      documents: [
        {
          document_id: 1,
          locales: [{ lang: "fr", title: "Sortie en Vanoise" }],
          activities: ["hiking"],
          date_start: "2026-07-01",
          date_end: "2026-07-01",
          elevation_max: 3000,
          global_rating: "PD",
        },
        {
          document_id: 2,
          locales: [{ lang: "fr", title: "Escalade aux Calanques" }],
          activities: ["rock_climbing"],
          date_start: "2026-06-10",
          date_end: "2026-06-12",
          rock_free_rating: "6a",
        },
      ],
    });

    const result = await handleSearchUserOutings({ user_id: 430052, limit: 10 });

    expect(mockSearchUserOutings).toHaveBeenCalledWith({ user_id: 430052, limit: 10 });
    expect(result).toContain("Found 2 outing(s) for user 430052");
    expect(result).toContain("[1] Sortie en Vanoise");
    expect(result).toContain("2026-07-01");
    expect(result).toContain("3000m");
    expect(result).toContain(
      "- [1] Sortie en Vanoise (hiking) | 2026-07-01 | Max elevation: 3000m | Global rating: PD\n",
    );
    expect(result).toContain(
      "- [2] Escalade aux Calanques (rock_climbing) | 2026-06-10 → 2026-06-12 | Rock free rating: 6a",
    );
    expect(result).not.toMatch(BARE_RATING);
    expect(result).not.toContain("undefined");
  });

  it("returns empty message when no results", async () => {
    mockSearchUserOutings.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await handleSearchUserOutings({ user_id: 430052, limit: 10 });

    expect(result).toBe("No outings found for user 430052.");
  });

  it("falls back to the first locale, then to Untitled, and omits missing fields", async () => {
    mockSearchUserOutings.mockResolvedValueOnce({
      total: 2,
      documents: [
        {
          document_id: 3,
          locales: [{ lang: "en", title: "Gran Paradiso" }],
          activities: ["skitouring"],
          date_start: "2026-04-02",
        },
        {
          document_id: 4,
          locales: [],
          activities: ["hiking"],
        },
      ],
    });

    const result = await handleSearchUserOutings({ user_id: 430052, limit: 10 });

    expect(result).toContain("- [3] Gran Paradiso (skitouring) | 2026-04-02\n");
    expect(result).toContain("- [4] Untitled (hiking)");
    expect(result).not.toContain("Max elevation");
    expect(result).not.toContain("Rating");
    expect(result).not.toContain("undefined");
  });
});

describe("handleGetOuting", () => {
  it("formats outing detail correctly", async () => {
    mockGetOuting.mockResolvedValueOnce({
      document_id: 42,
      locales: [
        {
          lang: "fr",
          title: "Traversée des Drus",
          description: "Belle journée en montagne.",
          conditions: "Neige dure le matin",
          weather: "Beau",
          timing: "8h",
          participants: "Alice, Bob",
          route_description: "Voie normale puis arête",
        },
      ],
      activities: ["mountain_climbing"],
      date_start: "2026-07-06",
      date_end: "2026-07-06",
      elevation_max: 3754,
      global_rating: "D",
      engagement_rating: "IV",
      participant_count: 2,
      author: { name: "o.laurendeau", user_id: 430052 },
      associations: {
        routes: [{ document_id: 100, locales: [{ lang: "fr", title: "Traversée des Drus" }] }],
      },
    });

    const result = await handleGetOuting({ id: 42 });

    expect(result.split("\n").slice(0, 3)).toEqual([
      "# Traversée des Drus (ID: 42)",
      "**URL**: https://www.camptocamp.org/outings/42",
      "**Author**: o.laurendeau (user ID: 430052)",
    ]);
    expect(result).toContain("**Author**: o.laurendeau (user ID: 430052)");
    expect(result).toContain("**Date**: 2026-07-06\n");
    expect(result).toContain("**Participants**: 2");
    expect(result).toContain("**Global rating**: D");
    expect(result).toContain("**Engagement**: IV");
    expect(result).toContain("**Max elevation**: 3754m");
    expect(result).toContain("## Description\nBelle journée en montagne.");
    expect(result).toContain("## Route description\nVoie normale puis arête");
    expect(result).toContain("## Conditions\nNeige dure le matin");
    expect(result).toContain("## Weather\nBeau");
    expect(result).toContain("## Timing\n8h");
    expect(result).toContain("## Participants\nAlice, Bob");
    expect(result).toContain("[100] Traversée des Drus");
  });

  it("renders every rating and elevation field", async () => {
    mockGetOuting.mockResolvedValueOnce({
      document_id: 43,
      locales: [{ lang: "fr", title: "Arête des Cosmiques" }],
      activities: ["mountain_climbing", "rock_climbing"],
      date_start: "2026-08-01",
      date_end: "2026-08-02",
      hiking_rating: "T4",
      rock_free_rating: "5c",
      equipment_rating: "P1",
      condition_rating: "good",
      elevation_max: 3842,
      elevation_min: 3613,
      height_diff_up: 450,
      height_diff_down: 220,
    });

    const result = await handleGetOuting({ id: 43 });

    expect(result).toContain("**Date**: 2026-08-01 → 2026-08-02");
    expect(result).toContain("**Hiking rating**: T4");
    expect(result).toContain("**Rock free rating**: 5c");
    expect(result).toContain("**Equipment**: P1");
    expect(result).toContain("**Conditions**: good");
    expect(result).toContain("**Min elevation**: 3613m");
    expect(result).toContain("**Elevation gain**: 450m");
    expect(result).toContain("**Elevation loss**: 220m");
  });

  it("omits absent sections and falls back to Untitled", async () => {
    mockGetOuting.mockResolvedValueOnce({
      document_id: 44,
      locales: [],
      activities: ["hiking"],
      associations: {
        routes: [
          { document_id: 101, locales: [{ lang: "it", title: "Via normale" }] },
          { document_id: 102, locales: [] },
        ],
      },
    });

    const result = await handleGetOuting({ id: 44 });

    expect(result).toContain("# Untitled (ID: 44)");
    expect(result).toContain("[101] Via normale");
    expect(result).toContain("[102] Untitled");
    expect(result).not.toContain("**Author**");
    expect(result).not.toContain("**Date**");
    for (const absent of [
      "**Participants**",
      "## Description",
      "## Route description",
      "## Conditions",
      "## Weather",
      "## Timing",
      "## Participants",
    ]) {
      expect(result).not.toContain(absent);
    }
    expect(result).not.toContain("undefined");
  });

  it("omits the associated routes section when there are none", async () => {
    mockGetOuting.mockResolvedValueOnce({
      document_id: 45,
      locales: [{ lang: "fr", title: "Balade" }],
      activities: ["hiking"],
      associations: { routes: [] },
    });

    const result = await handleGetOuting({ id: 45 });

    expect(result).not.toContain("## Associated routes");
  });

  it("prints the summit name and the ratings on associated route lines", async () => {
    // Trimmed from the live GET /outings/1880674 response (2026-10-04): texts and untyped fields (snow,
    // frequentation, hut_status…) left out; the route association reduced to its locales' lang, title
    // and title_prefix, and its ratings. Route 1678194, with a blank title_prefix, is added to check the trimming.
    mockGetOuting.mockResolvedValueOnce({
      document_id: 1880674,
      locales: [{ lang: "fr", title: "Mont Pourri : Versant W par le Glacier du Geay" }],
      activities: ["skitouring"],
      date_start: "2026-03-07",
      date_end: "2026-03-08",
      elevation_max: 3779,
      elevation_min: 2370,
      height_diff_up: 1600,
      height_diff_down: null,
      condition_rating: "good",
      participant_count: 2,
      ski_rating: "4.1",
      labande_global_rating: "AD",
      associations: {
        routes: [
          {
            document_id: 54085,
            locales: [
              { lang: "fr", title: "Versant W par le Glacier du Geay", title_prefix: "Mont Pourri" },
              { lang: "de", title: "Voie normale du Glacier du Geay", title_prefix: "Mont Pourri" },
              { lang: "en", title: "Normal route from Glacier du Geay", title_prefix: "Mont Pourri" },
              { lang: "it", title: "Voie normale du Glacier du Geay", title_prefix: "Mont Pourri" },
            ],
            ski_rating: "4.1",
            ski_exposition: "E2",
            labande_ski_rating: "S4",
            labande_global_rating: "AD",
          },
          {
            document_id: 1678194,
            locales: [{ lang: "fr", title: "Tour du Mont Pourri en 5 jours", title_prefix: "   " }],
          },
        ],
      },
    });

    const result = await handleGetOuting({ id: 1880674 });

    const lines = result.split("\n");
    const participants = lines.indexOf("**Participants**: 2");
    expect(lines.slice(participants + 1, participants + 4)).toEqual([
      "**Ski rating (Toponeige)**: 4.1",
      "**Labande**: AD",
      "**Conditions**: good",
    ]);
    expect(lines.slice(lines.indexOf("## Associated routes") + 1)).toEqual([
      "- [54085] Mont Pourri : Versant W par le Glacier du Geay | Ski rating (Toponeige): 4.1 | Ski exposure: E2 | Labande: S4 / AD",
      "- [1678194] Tour du Mont Pourri en 5 jours",
    ]);
    expect(result).not.toMatch(BARE_RATING);
  });

  it("propagates API errors", async () => {
    mockGetOuting.mockRejectedValueOnce(new Error("Camptocamp API error: 404"));

    await expect(handleGetOuting({ id: 999 })).rejects.toThrow("Camptocamp API error: 404");
  });
});

// Mirrors GET /outings?r=53884&date=2026-06-01,2026-09-30&sort=-date_end&lang=fr (2026-10-03):
// list items omit absent ratings instead of sending null, and areas mix country, range and admin_limits.
const cosmiques: OutingListItem = {
  document_id: 1938453,
  locales: [{ lang: "fr", title: "Aiguille du Midi : Arête des Cosmiques" }],
  activities: ["mountain_climbing", "snow_ice_mixed"],
  condition_rating: "average",
  date_end: "2026-08-10",
  date_start: "2026-08-10",
  elevation_max: 3842,
  height_diff_up: 300,
  global_rating: "AD",
  areas: [
    { document_id: 14274, area_type: "country", locales: [{ lang: "fr", title: "France" }] },
    { document_id: 14410, area_type: "range", locales: [{ lang: "fr", title: "Mont-Blanc" }] },
    { document_id: 14366, area_type: "admin_limits", locales: [{ lang: "fr", title: "Haute-Savoie" }] },
  ],
  author: { name: "Keagan B.", user_id: 1910408 },
};

// Winter 2026 ski touring outing: global_rating is null, the ski ratings carry the difficulty.
const skiTouring: OutingListItem = {
  document_id: 1890001,
  locales: [{ lang: "fr", title: "Pointe de la Réchasse : Couloir Nord" }],
  activities: ["skitouring"],
  date_start: "2026-02-14",
  date_end: "2026-02-14",
  condition_rating: "good",
  elevation_max: 3212,
  height_diff_up: 1250,
  global_rating: null,
  ski_rating: "2.3",
  labande_global_rating: "PD+",
  areas: [{ document_id: 14409, area_type: "range", locales: [{ lang: "fr", title: "Vanoise" }] }],
  author: { name: "skieur73", user_id: 123456 },
};

function listResponse(documents: OutingListItem[], total = documents.length): OutingListResponse {
  return { total, documents };
}

/** Calls the handler as the MCP server does: with input parsed by the tool schema, defaults applied. */
function search(input: z.input<typeof searchOutingsSchema> = {}): Promise<string> {
  return handleSearchOutings(searchOutingsSchema.parse(input));
}

describe("handleSearchOutings", () => {
  // Field rules (dates, activity, limit, IDs) are checked by the SDK: tests/server/input-validation.test.ts.
  describe("cross-field rules", () => {
    it("rejects a reversed date range without calling the API", async () => {
      await expect(search({ date_from: "2026-09-30", date_to: "2026-09-01" })).rejects.toThrow(
        "date_from (2026-09-30) must be on or before date_to (2026-09-01).",
      );
      expect(mockSearchOutings).not.toHaveBeenCalled();
    });

    it("rejects offset + limit above 10,000 without calling the API", async () => {
      await expect(search({ offset: 9995, limit: 10 })).rejects.toThrow(
        "offset + limit must not exceed 10000: Camptocamp only returns the first 10,000 results of a search. Narrow the filters instead.",
      );
      expect(mockSearchOutings).not.toHaveBeenCalled();
    });

    it("accepts offset + limit of exactly 10,000", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([]));

      await search({ offset: 9990, limit: 10 });

      expect(mockSearchOutings).toHaveBeenCalledWith({ limit: 10, offset: 9990 });
    });

    it("accepts equal date_from and date_to", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([]));

      await search({ date_from: "2026-08-10", date_to: "2026-08-10" });

      expect(mockSearchOutings).toHaveBeenCalledWith({
        date_from: "2026-08-10",
        date_to: "2026-08-10",
        limit: 10,
        offset: 0,
      });
    });

    it("treats a whitespace-only query as missing", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([]));

      const result = await search({ query: "  " });

      expect(mockSearchOutings).toHaveBeenCalledWith({ limit: 10, offset: 0 });
      expect(mockSearchOutings.mock.calls[0]?.[0]).not.toHaveProperty("query");
      expect(result).toBe("No outings found.");
    });
  });

  describe("calls and header", () => {
    it("calls the API with defaults and prints no Filters line when no filter is set", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([cosmiques], 346652));

      const result = await search({});

      expect(mockSearchOutings).toHaveBeenCalledWith({ limit: 10, offset: 0 });
      expect(result.split("\n").slice(0, 2)).toEqual([
        "Found 346652 outing(s), most recent first. Showing 1 from offset 0:",
        "",
      ]);
      expect(result).not.toContain("Filters:");
    });

    it("passes every filter to the API", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([]));
      const input = {
        query: "cosmiques",
        area_id: 14409,
        activity: "skitouring" as const,
        date_from: "2026-01-01",
        date_to: "2026-03-31",
        route_id: 53884,
        waypoint_id: 37233,
        limit: 20,
        offset: 40,
      };

      await search(input);

      expect(mockSearchOutings).toHaveBeenCalledWith(input);
    });

    it("shows total and page size unchanged, then the applied filters", async () => {
      const documents = Array.from({ length: 10 }, (_, i) => ({ ...skiTouring, document_id: 1890001 + i }));
      mockSearchOutings.mockResolvedValueOnce(listResponse(documents, 644));

      const result = await search({
        area_id: 14409,
        activity: "skitouring",
        date_from: "2026-01-01",
        date_to: "2026-03-31",
      });
      const lines = result.split("\n");

      expect(lines[0]).toBe("Found 644 outing(s), most recent first. Showing 10 from offset 0:");
      expect(lines[1]).toBe("Filters: area 14409, activity skitouring, dates 2026-01-01 → 2026-03-31");
      expect(lines[2]).toBe("");
      expect(lines.slice(3, 13).every((line) => line.startsWith("- ["))).toBe(true);
      expect(lines[3]).toMatch(/^- \[1890001\] /);
      expect(lines.slice(13)).toEqual(["", "Next page: offset=10"]);
    });

    it("lists query, dates, route and waypoint filters in a fixed order", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([cosmiques], 625));

      const result = await search({
        waypoint_id: 37233,
        route_id: 53884,
        date_from: "2026-09-01",
        query: "cosmiques",
        offset: 20,
      });

      expect(result.split("\n").slice(0, 2)).toEqual([
        "Found 625 outing(s), most recent first. Showing 1 from offset 20:",
        'Filters: query "cosmiques", dates from 2026-09-01, route 53884, waypoint 37233',
      ]);
    });

    it("describes an until-only date range", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([cosmiques]));

      const result = await search({ date_to: "2026-01-01" });

      expect(result.split("\n")[1]).toBe("Filters: dates until 2026-01-01");
    });
  });

  // S5: outings in the same days of every year (AC5.1–AC5.4), and by user (AC5.5).
  describe("period and user", () => {
    const PERIOD_NOTE = "Note: Camptocamp's period filter can miss outings on the first or last day of the range.";
    // A June outing at waypoint 37916, trimmed from the live period search (2026-10-04).
    const june: OutingListItem = {
      ...cosmiques,
      document_id: 1610921,
      date_start: "2024-06-12",
      date_end: "2024-06-12",
      areas: null,
      author: null,
    };

    it("sends the period as given to the API, alongside the other filters", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([june], 66));

      await search({ waypoint_id: 37916, period_start: "06-01", period_end: "06-30" });

      expect(mockSearchOutings).toHaveBeenCalledWith({
        waypoint_id: 37916,
        period: { start: "06-01", end: "06-30" },
        limit: 10,
        offset: 0,
      });
    });

    it("prints the period filter and the boundary-day note in the header (D1)", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([june], 66));

      const result = await search({ waypoint_id: 37916, period_start: "06-01", period_end: "06-30" });

      expect(result.split("\n").slice(0, 4)).toEqual([
        "Found 66 outing(s), most recent first. Showing 1 from offset 0:",
        "Filters: period 06-01 → 06-30 of every year, waypoint 37916",
        PERIOD_NOTE,
        "",
      ]);
    });

    it("accepts a one-day period and the leap day", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([]));

      await search({ period_start: "02-29", period_end: "02-29" });

      expect(mockSearchOutings).toHaveBeenCalledWith({
        period: { start: "02-29", end: "02-29" },
        limit: 10,
        offset: 0,
      });
    });

    it("combines the period with a date range (AC5.3)", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([june], 13));

      const result = await search({
        waypoint_id: 37916,
        period_start: "06-01",
        period_end: "06-30",
        date_from: "2015-01-01",
        date_to: "2020-12-31",
      });

      expect(mockSearchOutings).toHaveBeenCalledWith({
        waypoint_id: 37916,
        period: { start: "06-01", end: "06-30" },
        date_from: "2015-01-01",
        date_to: "2020-12-31",
        limit: 10,
        offset: 0,
      });
      expect(result.split("\n")[1]).toBe(
        "Filters: dates 2015-01-01 → 2020-12-31, period 06-01 → 06-30 of every year, waypoint 37916",
      );
    });

    it.each<[string, Record<string, string>]>([
      ["period_start without period_end", { period_start: "06-01" }],
      ["period_end without period_start", { period_end: "06-30" }],
    ])("rejects %s without calling the API", async (_label, period) => {
      await expect(search(period)).rejects.toThrow(
        "period_start and period_end must be given together (MM-DD, e.g. 06-01 and 06-30).",
      );
      expect(mockSearchOutings).not.toHaveBeenCalled();
    });

    it("rejects a period wrapping around the new year with the two calls to make (AC5.2)", async () => {
      await expect(search({ period_start: "12-20", period_end: "01-10" })).rejects.toThrow(
        "period cannot wrap around the new year; make two calls (12-20 → 12-31 and 01-01 → 01-10)",
      );
      expect(mockSearchOutings).not.toHaveBeenCalled();
    });

    it("sends user_id and lists the user first among the filters (AC5.5)", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([cosmiques], 23));
      const input = {
        user_id: 430052,
        activity: "rock_climbing" as const,
        date_from: "2025-01-01",
        date_to: "2025-12-31",
      };

      const result = await search(input);

      expect(mockSearchOutings).toHaveBeenCalledWith({ ...input, limit: 10, offset: 0 });
      expect(result.split("\n").slice(0, 3)).toEqual([
        "Found 23 outing(s), most recent first. Showing 1 from offset 0:",
        "Filters: user 430052, activity rock_climbing, dates 2025-01-01 → 2025-12-31",
        "",
      ]);
      expect(result).not.toContain("Note:");
    });

    // The period filter can drop boundary days, so "nothing found" is not stated as a plain fact.
    it("keeps the boundary-day note when nothing matches the period", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([]));

      const result = await search({ waypoint_id: 37916, period_start: "07-14", period_end: "07-14" });

      expect(result).toBe(
        `No outings found matching period 07-14 → 07-14 of every year, waypoint 37916.\n${PERIOD_NOTE}`,
      );
    });

    it("names the user when nothing matches", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([]));

      expect(await search({ user_id: 430052 })).toBe("No outings found matching user 430052.");
    });
  });

  // R6 / AC9.4: the output tells how to fetch the next page, within Camptocamp's 10,000-result window.
  describe("paging footer", () => {
    const page = (n: number, first: number): OutingListItem[] =>
      Array.from({ length: n }, (_, i) => ({ ...cosmiques, document_id: first + i }));

    it("ends with the next page offset when more outings follow", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse(page(10, 1938400), 23));

      const result = await search({ route_id: 53884 });

      expect(result.split("\n").at(-1)).toBe("Next page: offset=10");
    });

    it("has no footer on the last page", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse(page(3, 1938420), 23));

      const result = await search({ route_id: 53884, offset: 20 });

      expect(result.split("\n").at(-1)).toMatch(/^- \[1938422\] /);
      expect(result).not.toContain("Next page");
    });

    it("gives the last offset that still fits in the 10,000-result window", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse(page(10, 1), 346652));

      const result = await search({ offset: 9980 });

      expect(result.split("\n").at(-1)).toBe("Next page: offset=9990");
    });

    it("caps the next page limit near the end of the 10,000-result window", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse(page(10, 1), 346652));

      const result = await search({ offset: 9985 });

      expect(result.split("\n").at(-1)).toBe("Next page: offset=9995 (limit at most 5)");
    });

    it("points past the 10,000-result window once the next offset reaches it", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse(page(10, 1), 346652));

      const result = await search({ offset: 9990 });

      expect(result.split("\n").at(-1)).toBe(
        "More results exist beyond Camptocamp's 10,000-result window; narrow the filters.",
      );
    });

    it("keeps the most-recent-first header on a page past the end", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([], 23));

      const result = await search({ route_id: 53884, offset: 30 });

      expect(result).toBe("Found 23 outing(s), most recent first. Showing 0 from offset 30:\nFilters: route 53884");
    });
  });

  describe("outing lines", () => {
    it("formats a real list item, listing only range areas", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([cosmiques], 14));

      const result = await search({ route_id: 53884, date_from: "2026-06-01", date_to: "2026-09-30" });

      expect(result.split("\n")[3]).toBe(
        "- [1938453] Aiguille du Midi : Arête des Cosmiques (mountain_climbing, snow_ice_mixed) | 2026-08-10 | Conditions: average | Max elevation: 3842m | Elevation gain: 300m | Global rating: AD | Areas: Mont-Blanc [14410] | Author: Keagan B.",
      );
    });

    it("shows ski and Labande ratings when global_rating is null", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([skiTouring]));

      const result = await search({ activity: "skitouring" });

      expect(result).toContain("Conditions: good");
      expect(result).toContain("Ski rating (Toponeige): 2.3 | Labande: PD+");
      expect(result).not.toContain("Global rating");
      expect(result).not.toMatch(BARE_RATING);
    });

    it("prints every part in order when every field is set", async () => {
      mockSearchOutings.mockResolvedValueOnce(
        listResponse([
          {
            document_id: 7,
            locales: [{ lang: "fr", title: "Tour complet" }],
            activities: ["mountain_climbing", "rock_climbing"],
            date_start: "2026-01-06",
            date_end: "2026-03-01",
            condition_rating: "excellent",
            elevation_max: 4808,
            height_diff_up: 0,
            global_rating: "D",
            ski_rating: "4.1",
            labande_global_rating: "AD",
            rock_free_rating: "5c",
            ice_rating: "3",
            hiking_rating: "T5",
            snowshoe_rating: "R3",
            areas: [
              { document_id: 14274, area_type: "country", locales: [{ lang: "fr", title: "France" }] },
              {
                document_id: 14410,
                area_type: "range",
                locales: [
                  { lang: "it", title: "Monte Bianco" },
                  { lang: "fr", title: "Mont-Blanc" },
                ],
              },
              { document_id: 14366, area_type: "admin_limits", locales: [{ lang: "fr", title: "Haute-Savoie" }] },
              { document_id: 14328, area_type: "range", locales: [{ lang: "fr", title: "Aiguilles Rouges" }] },
            ],
            author: { name: "o.laurendeau", user_id: 430052 },
          },
        ]),
      );

      const result = await search({});

      expect(result.split("\n")[2]).toBe(
        "- [7] Tour complet (mountain_climbing, rock_climbing) | 2026-01-06 → 2026-03-01 | Conditions: excellent | Max elevation: 4808m | Elevation gain: 0m | Ski rating (Toponeige): 4.1 | Labande: AD | Global rating: D | Rock free rating: 5c | Ice rating: 3 | Hiking rating: T5 | Snowshoe rating: R3 | Areas: Mont-Blanc [14410], Aiguilles Rouges [14328] | Author: o.laurendeau",
      );
    });

    it("prints only id, Untitled and activities for an empty outing", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([{ document_id: 4, locales: [], activities: ["hiking"] }]));

      const result = await search({});

      expect(result.split("\n")[2]).toBe("- [4] Untitled (hiking)");
    });

    it("prints nothing for null fields, empty strings or areas without a range", async () => {
      mockSearchOutings.mockResolvedValueOnce(
        listResponse([
          {
            document_id: 4,
            locales: [],
            activities: ["hiking"],
            date_start: null,
            date_end: null,
            condition_rating: null,
            elevation_max: null,
            height_diff_up: null,
            global_rating: null,
            ski_rating: null,
            labande_global_rating: null,
            rock_free_rating: null,
            ice_rating: null,
            hiking_rating: "",
            snowshoe_rating: null,
            areas: null,
            author: null,
          },
          {
            document_id: 5,
            locales: [],
            activities: ["hiking"],
            areas: [
              { document_id: 14274, area_type: "country", locales: [{ lang: "fr", title: "France" }] },
              { document_id: 1, area_type: null, locales: [] },
            ],
          },
        ]),
      );

      const result = await search({});

      expect(result.split("\n").slice(2)).toEqual(["- [4] Untitled (hiking)", "- [5] Untitled (hiking)"]);
      for (const absent of ["undefined", "null", "NaN"]) {
        expect(result).not.toContain(absent);
      }
    });

    it("falls back to the first locale for outing and area titles", async () => {
      mockSearchOutings.mockResolvedValueOnce(
        listResponse([
          {
            document_id: 1500001,
            locales: [{ lang: "it", title: "Resegone : Via Ferrata Gamma 2" }],
            activities: ["via_ferrata"],
            date_start: "2026-09-20",
            date_end: "2026-09-20",
            areas: [
              { document_id: 14462, area_type: "range", locales: [{ lang: "it", title: "Prealpi Lombarde" }] },
              { document_id: 14999, area_type: "range", locales: [] },
            ],
          },
        ]),
      );

      const result = await search({ query: "gamma" });

      expect(result.split("\n")[3]).toBe(
        "- [1500001] Resegone : Via Ferrata Gamma 2 (via_ferrata) | 2026-09-20 | Areas: Prealpi Lombarde [14462], Untitled [14999]",
      );
    });
  });

  describe("empty results and errors", () => {
    it("names the filters when nothing matches, without claiming the ID does not exist", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([]));

      const result = await search({ route_id: 53884 });

      expect(result).toBe("No outings found matching route 53884.");
    });

    it("says no outings found when no filter is set", async () => {
      mockSearchOutings.mockResolvedValueOnce(listResponse([]));

      expect(await search({})).toBe("No outings found.");
    });

    it("propagates API errors", async () => {
      mockSearchOutings.mockRejectedValueOnce(new Error("Camptocamp API error: 500 Internal Server Error"));

      await expect(search({})).rejects.toThrow("Camptocamp API error: 500 Internal Server Error");
    });
  });
});

describe("outingToolDefinitions", () => {
  it("appends search_outings after the existing outing tools", () => {
    expect(outingToolDefinitions.map((t) => t.name)).toEqual(["search_user_outings", "get_outing", "search_outings"]);
  });

  it("describes ordering, date overlap, period, user, paging and where IDs come from", () => {
    const description = outingToolDefinitions.find((t) => t.name === "search_outings")?.description ?? "";

    for (const phrase of [
      "most recent first",
      "overlap",
      "search_areas",
      "search_routes",
      "search_waypoints",
      "get_outing",
      "period_start / period_end (MM-DD",
      "every year",
      "cannot wrap around the new year",
      "can miss outings on the first or last day of the range",
      "user_id",
      "Next page: offset=N",
      "Next page: offset=N (limit at most M)",
      "10,000-result window",
    ]) {
      expect(description).toContain(phrase);
    }
  });

  // AC5.7: no tool exposes a real user's ID or username as an example.
  it("gives no real user as an example in the search_outings definition", () => {
    const definition = outingToolDefinitions.find((t) => t.name === "search_outings");
    const text = JSON.stringify({ d: definition?.description, s: definition?.inputSchema.shape });

    expect(text).not.toContain("430052");
    expect(text).not.toContain("o.laurendeau");
  });
});
