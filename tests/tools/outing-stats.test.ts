import { describe, it, expect, vi, beforeEach } from "vitest";
import type { z } from "zod";
import {
  COUNTS_NOTE,
  collectMatchingOutings,
  handleOutingStats,
  outingStatsSchema,
  outingStatsToolDefinitions,
} from "../../src/tools/outing-stats.js";
import { PERIOD_NOTE } from "../../src/tools/outings.js";
import { LANG_NOTE } from "../../src/tools/inputs.js";
import * as api from "../../src/api/camptocamp.js";
import type { OutingListResponse, OutingSearchParams } from "../../src/api/camptocamp.js";
import { outingListResponseSchema } from "../../src/api/schemas.js";
import { throughSchema } from "./through-schema.js";

vi.mock("../../src/api/camptocamp.js");

const mockSearchOutings = throughSchema(vi.mocked(api.searchOutings), outingListResponseSchema);

beforeEach(() => {
  vi.clearAllMocks();
});

// Shaped like the items of GET /outings?r=54513&sort=-date_end,-id&limit=100&offset=0&pl=fr (2026-10-05):
// the list items leave out unset ratings and fields such as height_diff_up, and carry no report text.
function outing(id: number): unknown {
  return {
    document_id: id,
    locales: [{ lang: "fr", title: "Mont Blanc : Arête de l'Innominata" }],
    activities: ["mountain_climbing"],
    date_start: "2026-07-03",
    date_end: "2026-07-05",
    condition_rating: id % 2 === 0 ? "good" : null,
    elevation_max: 4810,
    global_rating: "D+",
    areas: [{ document_id: 14410, area_type: "range", locales: [{ lang: "fr", title: "Mont-Blanc" }] }],
    author: { name: "lucasd43", user_id: 1724768 },
  };
}

// The page of a search matching `total` outings with IDs 1..total, as the API returns it for this offset.
function page(total: number, offset: number, limit = 100): OutingListResponse {
  const count = Math.max(0, Math.min(limit, total - offset));
  const documents = Array.from({ length: count }, (_, i) => outing(offset + i + 1));
  return { total, documents } as unknown as OutingListResponse;
}

// Answers every call with the page of `total` outings at the requested offset.
function serve(total: number) {
  mockSearchOutings.mockImplementation((params?: OutingSearchParams) =>
    Promise.resolve(page(total, params?.offset ?? 0, params?.limit)),
  );
}

const ids = (response: OutingListResponse) => response.documents.map((d) => d.document_id);
const offsets = () => mockSearchOutings.mock.calls.map(([params]) => params?.offset);

describe("collectMatchingOutings", () => {
  it("reads 61 outings in one call of 100, sorted with the ID tiebreak", async () => {
    serve(61);

    const result = await collectMatchingOutings({ route_id: 54513, lang: "fr" });

    expect(mockSearchOutings.mock.calls).toEqual([
      [{ route_id: 54513, lang: "fr", limit: 100, offset: 0, tiebreak_by_id: true }],
    ]);
    expect(result.total).toBe(61);
    expect(ids(result)).toEqual(Array.from({ length: 61 }, (_, i) => i + 1));
  });

  it("reads no outing when nothing matches", async () => {
    serve(0);

    const result = await collectMatchingOutings({ route_ids: [999999999] });

    expect(mockSearchOutings).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ total: 0, documents: [] });
  });

  it("reads exactly 100 outings in one call", async () => {
    serve(100);

    const result = await collectMatchingOutings({});

    expect(offsets()).toEqual([0]);
    expect(result.documents).toHaveLength(100);
  });

  it("reads 250 outings at offsets 0, 100 and 200, in page order", async () => {
    serve(250);

    const result = await collectMatchingOutings({ area_id: 14410, activity: "mountain_climbing" });

    expect(offsets()).toEqual([0, 100, 200]);
    for (const [params] of mockSearchOutings.mock.calls) {
      expect(params).toEqual({
        area_id: 14410,
        activity: "mountain_climbing",
        limit: 100,
        offset: params?.offset,
        tiebreak_by_id: true,
      });
    }
    expect(ids(result)).toEqual(Array.from({ length: 250 }, (_, i) => i + 1));
  });

  it("reads 2,000 outings in 20 pages, at most 3 in flight after the first", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mockSearchOutings.mockImplementation(async (params?: OutingSearchParams) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return page(2000, params?.offset ?? 0);
    });

    const result = await collectMatchingOutings({ activity: "skitouring" });

    expect(offsets()).toEqual(Array.from({ length: 20 }, (_, i) => i * 100));
    expect(maxInFlight).toBe(3);
    expect(result.total).toBe(2000);
    expect(new Set(ids(result)).size).toBe(2000);
  });

  // AC4.5: refused before paging, nothing sampled.
  it("refuses a total over 2,000 after the first call, with the total", async () => {
    serve(2001);

    await expect(collectMatchingOutings({ activity: "skitouring" })).rejects.toThrow(
      /2,001 outings match.*narrow the filters/,
    );
    expect(mockSearchOutings).toHaveBeenCalledTimes(1);
  });

  it("fails when a later page reports another total", async () => {
    mockSearchOutings.mockImplementation((params?: OutingSearchParams) => {
      const offset = params?.offset ?? 0;
      return Promise.resolve(page(offset === 200 ? 251 : 250, offset));
    });

    await expect(collectMatchingOutings({})).rejects.toThrow("Camptocamp's results changed while counting; call again");
  });

  // An outing published between two pages shifts the others: the last of page 1 comes again on page 2.
  it("fails when an outing comes back on two pages", async () => {
    mockSearchOutings.mockImplementation((params?: OutingSearchParams) => {
      const offset = params?.offset ?? 0;
      const response = page(150, offset);
      if (offset === 100) response.documents[0] = page(150, 99).documents[0];
      return Promise.resolve(response);
    });

    await expect(collectMatchingOutings({})).rejects.toThrow("results changed");
  });

  it("fails when the pages hold fewer outings than the total", async () => {
    mockSearchOutings.mockImplementation((params?: OutingSearchParams) => {
      const offset = params?.offset ?? 0;
      return Promise.resolve(offset === 100 ? page(150, 0, 40) : page(150, offset));
    });

    await expect(collectMatchingOutings({})).rejects.toThrow("results changed");
  });

  // A list item that fails its schema is kept as a MalformedItem: it still counts, by its ID when readable.
  it("keeps malformed outings, by their ID when readable", async () => {
    mockSearchOutings.mockResolvedValueOnce({
      total: 3,
      documents: [outing(1), { document_id: 2, locales: null }, { title: "no ID" }],
    } as unknown as OutingListResponse);

    const result = await collectMatchingOutings({});

    expect(result.documents).toEqual([
      expect.objectContaining({ document_id: 1 }),
      { malformed: true, document_id: 2 },
      { malformed: true },
    ]);
  });

  it("fails when a malformed outing without an ID hides a missing one", async () => {
    mockSearchOutings.mockResolvedValueOnce({
      total: 3,
      documents: [outing(1), outing(1), { title: "no ID" }],
    } as unknown as OutingListResponse);

    await expect(collectMatchingOutings({})).rejects.toThrow("results changed");
  });

  it("fails when a page fails, with that page's error", async () => {
    mockSearchOutings.mockImplementation((params?: OutingSearchParams) => {
      const offset = params?.offset ?? 0;
      return offset === 100
        ? Promise.reject(new Error("Camptocamp API error: 503"))
        : Promise.resolve(page(250, offset));
    });

    await expect(collectMatchingOutings({})).rejects.toThrow("Camptocamp API error: 503");
  });

  it("fails when the first page fails, without reading more", async () => {
    mockSearchOutings.mockRejectedValueOnce(new Error("Camptocamp API error: 503"));

    await expect(collectMatchingOutings({})).rejects.toThrow("Camptocamp API error: 503");
    expect(mockSearchOutings).toHaveBeenCalledTimes(1);
  });
});

// The 61 outings of GET /outings?r=54513&sort=-date_end,-id&limit=100&offset=0&pl=fr (2026-10-05), the
// Innominata: [document_id, date_start, date_end, condition_rating], most recent first. All 61 items carried
// condition_rating, null on 17 of them.
const INNOMINATA: [number, string, string, string | null][] = [
  [1924138, "2026-07-03", "2026-07-05", "average"],
  [1917601, "2026-06-17", "2026-06-17", "good"],
  [1783461, "2025-06-20", "2025-06-22", "excellent"],
  [1784207, "2025-06-16", "2025-06-18", "good"],
  [1670075, "2024-07-24", "2024-07-27", "good"],
  [1673759, "2024-07-23", "2024-07-25", "good"],
  [1666764, "2024-07-16", "2024-07-18", "average"],
  [1560424, "2023-07-27", "2023-07-28", "average"],
  [1554839, "2023-07-14", "2023-07-14", null],
  [1553734, "2023-07-08", "2023-07-09", "good"],
  [1550316, "2023-06-28", "2023-06-30", "excellent"],
  [1545314, "2023-06-17", "2023-06-18", "good"],
  [1442478, "2022-07-15", "2022-07-15", "good"],
  [1439125, "2022-07-05", "2022-07-07", null],
  [1433670, "2022-06-19", "2022-06-19", null],
  [1338827, "2021-08-11", "2021-08-12", "good"],
  [1020262, "2018-06-30", "2018-07-01", "average"],
  [1014454, "2018-06-30", "2018-06-30", "good"],
  [1013452, "2018-06-28", "2018-06-28", "excellent"],
  [1012136, "2018-06-19", "2018-06-20", "good"],
  [908630, "2017-07-15", "2017-07-16", "average"],
  [809629, "2016-10-05", "2016-10-05", "good"],
  [808270, "2016-09-30", "2016-09-30", "good"],
  [793912, "2016-08-08", "2016-08-08", null],
  [784920, "2016-08-03", "2016-08-03", "excellent"],
  [782841, "2016-07-29", "2016-07-29", "excellent"],
  [946390, "2016-07-19", "2016-07-19", "good"],
  [777889, "2016-07-18", "2016-07-18", "excellent"],
  [773789, "2016-07-08", "2016-07-08", "excellent"],
  [773755, "2016-07-08", "2016-07-08", "good"],
  [671539, "2015-08-28", "2015-08-28", "good"],
  [669600, "2015-08-27", "2015-08-27", "good"],
  [677355, "2015-07-09", "2015-07-09", null],
  [646626, "2015-06-27", "2015-06-27", "good"],
  [562803, "2014-09-16", "2014-09-16", null],
  [561490, "2014-09-14", "2014-09-14", "excellent"],
  [554025, "2014-08-23", "2014-08-23", "excellent"],
  [533742, "2014-06-07", "2014-06-07", "average"],
  [457240, "2013-08-23", "2013-08-23", "excellent"],
  [456380, "2013-08-21", "2013-08-21", "good"],
  [456047, "2013-08-20", "2013-08-20", "good"],
  [453189, "2013-08-11", "2013-08-11", "good"],
  [365965, "2012-08-09", "2012-08-09", "good"],
  [408579, "2012-07-21", "2012-07-21", "average"],
  [381963, "2012-07-21", "2012-07-21", null],
  [294232, "2011-08-21", "2011-08-21", "good"],
  [292153, "2011-08-13", "2011-08-13", "excellent"],
  [176211, "2009-07-12", "2009-07-12", null],
  [137650, "2008-08-28", "2008-08-28", "excellent"],
  [136167, "2008-08-10", "2008-08-10", "good"],
  [134050, "2008-07-22", "2008-07-22", "good"],
  [101527, "2007-09-22", "2007-09-22", null],
  [101321, "2007-09-09", "2007-09-09", null],
  [100859, "2007-08-18", "2007-08-18", null],
  [91808, "2006-07-10", "2006-07-10", null],
  [83336, "2005-08-09", "2005-08-09", null],
  [82938, "2005-07-17", "2005-07-17", null],
  [1903246, "2005-06-23", "2005-06-23", null],
  [69343, "2003-07-20", "2003-07-20", null],
  [64638, "2002-08-17", "2002-08-17", null],
  [219347, "1994-07-19", "1994-07-19", "awful"],
];

// A list item shaped like those of the search above, with the fields outing_stats reads taken from the tuple.
function innominata([id, start, end, condition]: (typeof INNOMINATA)[number]): Record<string, unknown> {
  return { ...(outing(id) as object), date_start: start, date_end: end, condition_rating: condition };
}

function stats(input: z.input<typeof outingStatsSchema>): Promise<string> {
  return handleOutingStats(outingStatsSchema.parse(input));
}

// Serves `documents` as the one page of every search.
function serveDocuments(documents: unknown[]): void {
  mockSearchOutings.mockResolvedValue({ total: documents.length, documents } as unknown as OutingListResponse);
}

// The sum of the counts of `<group>: N` lines.
function sum(lines: string[]): number {
  return lines.reduce((total, line) => total + Number(line.slice(line.lastIndexOf(" ") + 1)), 0);
}

const MONTH_ZEROS = Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}: 0`);

// AC4.6 on #255, word for word.
const AC46 =
  "counts of trip reports published on Camptocamp, not of ascents; a month with no report is not evidence the " +
  "route is out of condition";

describe("handleOutingStats", () => {
  // AC4.1 on #255.
  it("counts the 61 Innominata outings by start month, 01 to 12 with zeros", async () => {
    serveDocuments(INNOMINATA.map(innominata));

    const result = await stats({ route_id: 54513, group_by: "month" });

    expect(mockSearchOutings.mock.calls).toEqual([[{ route_id: 54513, limit: 100, offset: 0, tiebreak_by_id: true }]]);
    expect(result).toBe(
      [
        "61 outing(s) counted (all matches), by start month",
        "Filters: route 54513",
        COUNTS_NOTE,
        "",
        "01: 0",
        "02: 0",
        "03: 0",
        "04: 0",
        "05: 0",
        "06: 13",
        "07: 24",
        "08: 18",
        "09: 5",
        "10: 1",
        "11: 0",
        "12: 0",
      ].join("\n"),
    );
  });

  // AC4.2 on #255: every year from 1994 to 2026, 2019 among the zeros.
  it("counts them by start year, from the first to the last year with zeros", async () => {
    serveDocuments(INNOMINATA.map(innominata));

    const lines = (await stats({ route_id: 54513, group_by: "year" })).split("\n");

    const counted: Record<string, number> = {
      ...{ 1994: 1, 2002: 1, 2003: 1, 2005: 3, 2006: 1, 2007: 3, 2008: 3, 2009: 1, 2011: 2, 2012: 3, 2013: 4 },
      ...{ 2014: 4, 2015: 4, 2016: 9, 2017: 1, 2018: 4, 2021: 1, 2022: 3, 2023: 5, 2024: 3, 2025: 2, 2026: 2 },
    };
    const years = Array.from({ length: 33 }, (_, i) => String(1994 + i));
    expect(lines.slice(0, 4)).toEqual([
      "61 outing(s) counted (all matches), by start year",
      "Filters: route 54513",
      COUNTS_NOTE,
      "",
    ]);
    expect(lines.slice(4)).toEqual(years.map((year) => `${year}: ${String(counted[year] ?? 0)}`));
    expect(lines).toContain("2016: 9");
    expect(lines).toContain("2019: 0");
    expect(sum(lines.slice(4))).toBe(61);
  });

  // #287: a year below 1000 is written with 4 digits, as counted, so its outings stay on its line.
  it("counts years below 1000 on 4-digit lines, adding up to the total", async () => {
    serveDocuments([
      innominata([1, "0998-05-12", "0998-05-12", null]),
      innominata([2, "1001-07-03", "1001-07-03", null]),
    ]);

    const result = await stats({ group_by: "year" });

    const lines = ["0998: 1", "0999: 0", "1000: 0", "1001: 1"];
    expect(result.split("\n\n")[1]).toBe(lines.join("\n"));
    expect(sum(lines)).toBe(2);
  });

  // AC4.3 on #255.
  it("counts them by condition, best first, then the outings without one", async () => {
    serveDocuments(INNOMINATA.map(innominata));

    const [head, body] = (await stats({ route_id: 54513, group_by: "condition" })).split("\n\n");

    expect(head).toBe(
      ["61 outing(s) counted (all matches), by condition", "Filters: route 54513", COUNTS_NOTE].join("\n"),
    );
    const lines = ["excellent: 12", "good: 24", "average: 7", "poor: 0", "awful: 1", "(not given): 17"];
    expect(body).toBe(lines.join("\n"));
    expect(sum(lines)).toBe(61);
  });

  // AC4.6 on #255.
  it("says the counts are of published reports, not of ascents, in the output and the description", async () => {
    serveDocuments([]);

    const result = await stats({ group_by: "month" });

    expect(COUNTS_NOTE).toBe(`C${AC46.slice(1)}.`);
    expect(result).toContain(COUNTS_NOTE);
    expect(outingStatsToolDefinitions[0].description).toContain(AC46);
  });

  it("counts no outing as zeros, with no year line", async () => {
    serveDocuments([]);

    expect(await stats({ route_ids: [999999999], group_by: "month" })).toBe(
      [
        "0 outing(s) counted (all matches), by start month",
        "Filters: route 999999999",
        COUNTS_NOTE,
        "",
        ...MONTH_ZEROS,
      ].join("\n"),
    );
    expect(await stats({ group_by: "year" })).toBe(
      ["0 outing(s) counted (all matches), by start year", COUNTS_NOTE].join("\n"),
    );
  });

  // AC4.4 on #255: the Filters line and the period Note of search_outings.
  it("prints the search_outings Filters line and the period Note for route_ids and a period", async () => {
    serveDocuments(INNOMINATA.slice(0, 2).map(innominata));

    const result = await stats({
      route_ids: [54513, 1148298, 54513],
      period_start: "06-01",
      period_end: "06-30",
      group_by: "condition",
    });

    expect(mockSearchOutings).toHaveBeenCalledWith({
      route_ids: [54513, 1148298],
      period: { start: "06-01", end: "06-30" },
      limit: 100,
      offset: 0,
      tiebreak_by_id: true,
    });
    expect(result.split("\n").slice(0, 4)).toEqual([
      "2 outing(s) counted (all matches), by condition",
      "Filters: period 06-01 → 06-30 of every year, routes 54513 or 1148298",
      PERIOD_NOTE,
      COUNTS_NOTE,
    ]);
  });

  it("passes every search_outings filter and lang on, and prints no Note without a period", async () => {
    serveDocuments([]);

    const result = await stats({
      query: "innominata",
      area_id: 14410,
      activity: "mountain_climbing",
      rating_system: "global_rating",
      rating_min: "D",
      condition_at_least: "good",
      max_elevation_min: 4000,
      height_diff_up_max: 3500,
      date_from: "2016-01-01",
      waypoint_id: 37916,
      user_id: 1625915,
      lang: "it",
      group_by: "month",
    });

    expect(mockSearchOutings).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "innominata",
        area_id: 14410,
        activity: "mountain_climbing",
        rating: expect.objectContaining({ system: "global_rating", min: "D" }) as unknown,
        condition_at_least: "good",
        elevation_max: expect.objectContaining({ min: 4000 }) as unknown,
        height_diff_up: expect.objectContaining({ max: 3500 }) as unknown,
        date_from: "2016-01-01",
        waypoint_id: 37916,
        user_id: 1625915,
        lang: "it",
        limit: 100,
        offset: 0,
        tiebreak_by_id: true,
      }),
    );
    expect(result).not.toContain("Note:");
  });

  // Review of #276: the collector's input type allows both route inputs, so the filters are checked first.
  it.each<[string, Omit<z.input<typeof outingStatsSchema>, "group_by">, string]>([
    ["route_id with route_ids", { route_id: 54513, route_ids: [1148298] }, "give route_id or route_ids, not both"],
    ["a wrapping period", { period_start: "12-20", period_end: "01-10" }, "period cannot wrap around the new year"],
    ["dates out of order", { date_from: "2026-07-01", date_to: "2026-06-01" }, "must be on or before date_to"],
  ])("refuses %s before any request", async (_label, input, message) => {
    await expect(stats({ ...input, group_by: "month" })).rejects.toThrow(message);
    expect(mockSearchOutings).not.toHaveBeenCalled();
  });

  // AC4.5 on #255: the collector's refusal, before paging; nothing is sampled.
  it("refuses more than 2,000 outings with the total, after one request", async () => {
    serve(2350);

    await expect(stats({ activity: "skitouring", group_by: "year" })).rejects.toThrow(
      /^2,350 outings match these filters.*narrow the filters/,
    );
    expect(mockSearchOutings).toHaveBeenCalledTimes(1);
  });

  // The lines always add up to the total: a missing start date, an unknown condition code and an unreadable item
  // each get their own line, never a month or (not given). A start date not in YYYY-MM-DD form is unreadable too.
  const ODD = [
    innominata([1, "2026-07-03", "2026-07-05", "good"]),
    { ...innominata([2, "", "2026-07-05", "good"]), date_start: null },
    { ...innominata([3, "", "2026-07-03", "superb"]), date_start: undefined },
    innominata([4, "2026-7-3", "2026-07-03", "superb"]),
    innominata([5, "2024-07-14", "2024-07-14", "dreadful"]),
    { document_id: 6, locales: null },
    { title: "no ID" },
  ];

  it.each<[z.infer<typeof outingStatsSchema>["group_by"], string[]]>([
    [
      "month",
      [...MONTH_ZEROS.slice(0, 6), "07: 2", ...MONTH_ZEROS.slice(7), "(no start date): 2", "(unexpected format): 3"],
    ],
    ["year", ["2024: 1", "2025: 0", "2026: 1", "(no start date): 2", "(unexpected format): 3"]],
    [
      "condition",
      [
        "excellent: 0",
        "good: 2",
        "average: 0",
        "poor: 0",
        "awful: 0",
        "dreadful: 1",
        "superb: 2",
        "(not given): 0",
      ].concat("(unexpected format): 2"),
    ],
  ])("counts odd outings by %s on their own lines, adding up to the total", async (group_by, lines) => {
    serveDocuments(ODD);

    const result = await stats({ group_by });

    expect(result.split("\n\n")[1].split("\n")).toEqual(lines);
    expect(sum(lines)).toBe(7);
  });
});

describe("outing_stats definition", () => {
  const [definition] = outingStatsToolDefinitions;

  it("takes the search_outings filters and group_by, without limit or offset", () => {
    const fields = Object.keys(outingStatsSchema.shape);

    expect(fields).toEqual(expect.arrayContaining(["route_id", "route_ids", "period_start", "lang", "group_by"]));
    expect(fields).not.toContain("limit");
    expect(fields).not.toContain("offset");
    expect(definition.inputSchema).toBe(outingStatsSchema);
  });

  it("requires group_by, one of month, year or condition", () => {
    expect(outingStatsSchema.safeParse({}).error?.issues.map((issue) => issue.path)).toEqual([["group_by"]]);
    expect(outingStatsSchema.safeParse({ group_by: "week" }).error?.issues[0].message).toBe(
      "must be one of: month, year, condition",
    );
  });

  it("keeps its description under 2,048 characters, with lang, the limit and how to read the reports", () => {
    expect(definition.name).toBe("outing_stats");
    expect(definition.description.length).toBeLessThan(2048);
    expect(definition.description).toContain(LANG_NOTE);
    expect(definition.description).toContain("more than 2,000");
    expect(definition.description).toContain("get_outings");
  });
});
