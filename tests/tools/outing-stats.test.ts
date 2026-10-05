import { describe, it, expect, vi, beforeEach } from "vitest";
import type { z } from "zod";
import {
  COUNTS_NOTE,
  collectMatchingOutings,
  collectOutingSets,
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

// The page at `offset` of route `route`'s search matching `total` outings, with IDs that tell the routes apart.
function routePage(route: number, total: number, offset: number): OutingListResponse {
  const count = Math.max(0, Math.min(100, total - offset));
  const documents = Array.from({ length: count }, (_, i) => outing(route * 10_000 + offset + i + 1));
  return { total, documents } as unknown as OutingListResponse;
}

// Answers each route's search with its pages, after 1 ms so that calls overlap, and tracks the calls in flight.
function serveRoutes(totals: Record<number, number>) {
  const tracker = { inFlight: 0, maxInFlight: 0 };
  mockSearchOutings.mockImplementation(async (params?: OutingSearchParams) => {
    tracker.inFlight++;
    tracker.maxInFlight = Math.max(tracker.maxInFlight, tracker.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    tracker.inFlight--;
    const route = params?.route_id ?? 0;
    return routePage(route, totals[route] ?? 0, params?.offset ?? 0);
  });
  return tracker;
}

const reads = () => mockSearchOutings.mock.calls.map(([params]) => [params?.route_id, params?.offset]);
const routeIds = (route: number, total: number) => Array.from({ length: total }, (_, i) => route * 10_000 + i + 1);

describe("collectOutingSets", () => {
  it("reads every set's first page before checking the totals, then the other pages", async () => {
    const tracker = serveRoutes({ 54513: 61, 54684: 30, 1148298: 250 });
    const checkTotals = vi.fn((totals: number[]) => {
      expect(totals).toEqual([61, 30, 250]);
      expect(reads()).toEqual([
        [54513, 0],
        [54684, 0],
        [1148298, 0],
      ]);
      expect(tracker.inFlight).toBe(0);
    });

    const results = await collectOutingSets(
      [{ route_id: 54513 }, { route_id: 54684, lang: "fr" }, { route_id: 1148298 }],
      checkTotals,
    );

    expect(checkTotals).toHaveBeenCalledTimes(1);
    expect(reads()).toEqual([
      [54513, 0],
      [54684, 0],
      [1148298, 0],
      [1148298, 100],
      [1148298, 200],
    ]);
    expect(mockSearchOutings.mock.calls[1]).toEqual([
      { route_id: 54684, lang: "fr", limit: 100, offset: 0, tiebreak_by_id: true },
    ]);
    expect(results.map((result) => result.total)).toEqual([61, 30, 250]);
    expect(results.map(ids)).toEqual([routeIds(54513, 61), routeIds(54684, 30), routeIds(1148298, 250)]);
  });

  it("reads nothing more when checkTotals refuses the totals", async () => {
    serveRoutes({ 1: 900, 2: 800, 3: 400 });

    await expect(
      collectOutingSets([{ route_id: 1 }, { route_id: 2 }, { route_id: 3 }], (totals) => {
        if (totals.reduce((a, b) => a + b) > 2000) throw new Error("2,100 outings: too many");
      }),
    ).rejects.toThrow("2,100 outings: too many");
    expect(reads()).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });

  it("reads 4 first pages at most 3 at a time", async () => {
    const tracker = serveRoutes({ 1: 10, 2: 20, 3: 30, 4: 40 });
    let inFlightAtCheck = -1;

    await collectOutingSets([{ route_id: 1 }, { route_id: 2 }, { route_id: 3 }, { route_id: 4 }], () => {
      inFlightAtCheck = tracker.inFlight;
    });

    expect(reads()).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
    expect(tracker.maxInFlight).toBe(3);
    expect(inFlightAtCheck).toBe(0);
  });

  it("reads 25 pages across sets with at most 3 requests in flight", async () => {
    const totals = { 1: 1000, 2: 800, 3: 450, 4: 200 };
    const tracker = serveRoutes(totals);
    let maxBeforeCheck = 0;

    const results = await collectOutingSets(
      [{ route_id: 1 }, { route_id: 2 }, { route_id: 3 }, { route_id: 4 }],
      () => {
        maxBeforeCheck = tracker.maxInFlight;
        tracker.maxInFlight = 0;
      },
    );

    expect(mockSearchOutings).toHaveBeenCalledTimes(25);
    expect(maxBeforeCheck).toBe(3);
    expect(tracker.maxInFlight).toBe(3);
    expect(results.map(ids)).toEqual(Object.entries(totals).map(([route, total]) => routeIds(Number(route), total)));
  });

  it("reads no page when there is no set", async () => {
    const checkTotals = vi.fn();

    await expect(collectOutingSets([], checkTotals)).resolves.toEqual([]);
    expect(checkTotals).toHaveBeenCalledWith([]);
    expect(mockSearchOutings).not.toHaveBeenCalled();
  });

  // Review of #315: routes 54513 and 54684 share 6 outings, so two sets may hold the same one; each set is checked
  // on its own.
  it("reads an outing that two sets share into both", async () => {
    mockSearchOutings.mockImplementation((params?: OutingSearchParams) =>
      Promise.resolve({
        total: 2,
        documents: [outing(908630), outing(params?.route_id ?? 0)],
      } as unknown as OutingListResponse),
    );

    const results = await collectOutingSets([{ route_id: 54513 }, { route_id: 54684 }], () => undefined);

    expect(results.map(ids)).toEqual([
      [908630, 54513],
      [908630, 54684],
    ]);
  });

  it("fails when a later page of any set reports another total", async () => {
    mockSearchOutings.mockImplementation((params?: OutingSearchParams) => {
      const route = params?.route_id ?? 0;
      const offset = params?.offset ?? 0;
      return Promise.resolve(routePage(route, route === 2 && offset === 100 ? 151 : 150, offset));
    });

    await expect(collectOutingSets([{ route_id: 1 }, { route_id: 2 }], () => undefined)).rejects.toThrow(
      "Camptocamp's results changed while counting; call again",
    );
  });

  it("fails when any set's pages repeat an outing", async () => {
    mockSearchOutings.mockImplementation((params?: OutingSearchParams) => {
      const route = params?.route_id ?? 0;
      const offset = params?.offset ?? 0;
      const response = routePage(route, 150, offset);
      if (route === 3 && offset === 100) response.documents[0] = routePage(3, 150, 99).documents[0];
      return Promise.resolve(response);
    });

    await expect(
      collectOutingSets([{ route_id: 1 }, { route_id: 2 }, { route_id: 3 }], () => undefined),
    ).rejects.toThrow("results changed");
  });

  it("fails when any set's pages hold fewer outings than its total", async () => {
    mockSearchOutings.mockImplementation((params?: OutingSearchParams) => {
      const route = params?.route_id ?? 0;
      const offset = params?.offset ?? 0;
      return Promise.resolve(route === 1 && offset === 0 ? routePage(1, 60, 20) : routePage(route, 60, offset));
    });

    await expect(collectOutingSets([{ route_id: 1 }, { route_id: 2 }], () => undefined)).rejects.toThrow(
      "results changed",
    );
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

// The 30 outings of GET /outings?r=54684&sort=-date_end,-id&limit=100&offset=0&pl=fr (2026-10-05), shaped as
// INNOMINATA. Six are Innominata outings too: 908630, 1560424, 1670075, 1673759, 1784207 and 1924138.
const ROUTE_54684: (typeof INNOMINATA)[number][] = [
  [1924138, "2026-07-03", "2026-07-05", "average"],
  [1942744, "2026-07-03", "2026-07-03", "good"],
  [1918685, "2026-06-20", "2026-06-21", "good"],
  [1795497, "2025-07-22", "2025-07-22", null],
  [1784760, "2025-06-24", "2025-06-24", "excellent"],
  [1784207, "2025-06-16", "2025-06-18", "good"],
  [1670075, "2024-07-24", "2024-07-27", "good"],
  [1673759, "2024-07-23", "2024-07-25", "good"],
  [1560424, "2023-07-27", "2023-07-28", "average"],
  [1539625, "2023-05-26", "2023-05-26", "poor"],
  [1433669, "2022-06-18", "2022-06-18", null],
  [1220662, "2020-06-30", "2020-06-30", "good"],
  [1159644, "2019-07-20", "2019-07-20", null],
  [1026532, "2018-06-20", "2018-06-20", "excellent"],
  [922834, "2017-08-27", "2017-08-30", "average"],
  [910224, "2017-07-29", "2017-07-29", null],
  [908630, "2017-07-15", "2017-07-16", "average"],
  [780610, "2016-07-26", "2016-07-26", "good"],
  [776357, "2016-07-09", "2016-07-09", "good"],
  [367173, "2012-08-15", "2012-08-15", "average"],
  [365659, "2012-08-08", "2012-08-08", "excellent"],
  [184489, "2009-09-06", "2009-09-06", "average"],
  [177834, "2009-07-25", "2009-07-25", "good"],
  [176524, "2009-07-16", "2009-07-16", "good"],
  [175817, "2009-07-12", "2009-07-12", "good"],
  [101560, "2007-09-23", "2007-09-23", null],
  [93510, "2006-11-11", "2006-11-11", null],
  [91932, "2006-07-16", "2006-07-16", null],
  [91524, "2006-06-25", "2006-06-25", null],
  [69276, "2003-07-13", "2003-07-13", null],
];

// The one outing of GET /outings?r=1148298&sort=-date_end,-id&limit=100&offset=0&pl=fr (2026-10-05).
const ROUTE_1148298: (typeof INNOMINATA)[number][] = [[1148311, "2019-09-04", "2019-09-05", null]];

// GET /outings?r=54513,54684,1148298&sort=-date_end,-id&limit=100&offset=0&pl=fr (2026-10-05): the 86 distinct
// outings of the three routes, by end date then ID, descending. The live response has these IDs in this order.
const THREE_ROUTES = [
  ...new Map([...INNOMINATA, ...ROUTE_54684, ...ROUTE_1148298].map((tuple) => [tuple[0], tuple])).values(),
].sort((a, b) => b[2].localeCompare(a[2]) || b[0] - a[0]);

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

    const lines = result.split("\n\n")[1].split("\n");
    expect(lines).toEqual(["0998: 1", "0999: 0", "1000: 0", "1001: 1"]);
    expect(sum(lines)).toBe(2);
  });

  // AC4.3 on #255.
  it("counts them by condition, best first, then the outings without one", async () => {
    serveDocuments(INNOMINATA.map(innominata));

    const [head, body] = (await stats({ route_id: 54513, group_by: "condition" })).split("\n\n");

    expect(head).toBe(
      ["61 outing(s) counted (all matches), by condition", "Filters: route 54513", COUNTS_NOTE].join("\n"),
    );
    const lines = body.split("\n");
    expect(lines).toEqual(["excellent: 12", "good: 24", "average: 7", "poor: 0", "awful: 1", "(not given): 17"]);
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

    const printed = result.split("\n\n")[1].split("\n");
    expect(printed).toEqual(lines);
    expect(sum(printed)).toBe(7);
  });
});

// The cells of the Markdown table rows of `output`, header first, without the separator row.
function tableOf(output: string): string[][] {
  return output
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ---"))
    .map((line) => line.slice(2, -2).split(" | "));
}

// The `<group>: N` lines printed below the table, after the blank line that ends it.
const belowTable = (output: string) => output.split("\n\n").slice(2).join("\n").split("\n").filter(Boolean);

// Checks that each row and each column of `rows` (a table with its total row and column) adds up to its total,
// and returns the table's total.
function expectTotalsAddUp(rows: string[][]): number {
  const counts = rows.slice(1).map((row) => row.slice(1).map(Number));
  for (const row of counts) expect(sum0(row.slice(0, -1))).toBe(row.at(-1));
  const totals = counts.at(-1) ?? [];
  totals.forEach((total, column) => {
    expect(sum0(counts.slice(0, -1).map((row) => row[column]))).toBe(total);
  });
  return totals.at(-1) ?? 0;
}

const sum0 = (values: number[]) => values.reduce((total, value) => total + value, 0);

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

// S3 of #303: a second axis gives a table of counts, rows from group_by and columns from split_by.
describe("handleOutingStats with split_by", () => {
  // AC3.1, AC3.5 of #303.
  it("counts the 61 Innominata outings by start month and condition in one request", async () => {
    serveDocuments(INNOMINATA.map(innominata));

    const result = await stats({ route_id: 54513, group_by: "month", split_by: "condition" });

    expect(mockSearchOutings.mock.calls).toEqual([[{ route_id: 54513, limit: 100, offset: 0, tiebreak_by_id: true }]]);
    const counted: Record<string, string> = {
      "06": "3 | 6 | 2 | 0 | 0 | 2 | 13",
      "07": "3 | 7 | 5 | 0 | 1 | 8 | 24",
      "08": "5 | 9 | 0 | 0 | 0 | 4 | 18",
      "09": "1 | 1 | 0 | 0 | 0 | 3 | 5",
      "10": "0 | 1 | 0 | 0 | 0 | 0 | 1",
    };
    expect(result).toBe(
      [
        "61 outing(s) counted (all matches), by start month and condition",
        "Filters: route 54513",
        COUNTS_NOTE,
        "",
        "| start month | excellent | good | average | poor | awful | (not given) | total |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ...MONTHS.map((month) => `| ${month} | ${counted[month] ?? "0 | 0 | 0 | 0 | 0 | 0 | 0"} |`),
        "| total | 12 | 24 | 7 | 0 | 1 | 17 | 61 |",
      ].join("\n"),
    );
  });

  // AC3.1 of #303: the row totals are the group_by counts, the column totals the split_by ones.
  it("gives the one-axis counts as its totals", async () => {
    serveDocuments(INNOMINATA.map(innominata));

    const rows = tableOf(await stats({ route_id: 54513, group_by: "month", split_by: "condition" }));
    const byMonth = (await stats({ route_id: 54513, group_by: "month" })).split("\n\n")[1].split("\n");
    const byCondition = (await stats({ route_id: 54513, group_by: "condition" })).split("\n\n")[1].split("\n");

    expect(rows.slice(1, -1).map((row) => `${row[0]}: ${row.at(-1) ?? ""}`)).toEqual(byMonth);
    expect(rows[0].slice(1, -1).map((condition, i) => `${condition}: ${rows.at(-1)?.[i + 1] ?? ""}`)).toEqual(
      byCondition,
    );
  });

  // AC3.2 of #303.
  it("counts them by start year and month, every year from 1994 to 2026", async () => {
    serveDocuments(INNOMINATA.map(innominata));

    const result = await stats({ route_id: 54513, group_by: "year", split_by: "month" });

    const rows = tableOf(result);
    expect(result.split("\n")[0]).toBe("61 outing(s) counted (all matches), by start year and start month");
    expect(rows[0]).toEqual(["start year", ...MONTHS, "total"]);
    expect(rows.slice(1, -1).map((row) => row[0])).toEqual(Array.from({ length: 33 }, (_, i) => String(1994 + i)));
    expect(rows.find((row) => row[0] === "2016")).toEqual(["2016", ..."000000521100".split(""), "9"]);
    expect(rows.find((row) => row[0] === "2019")).toEqual(["2019", ...Array<string>(13).fill("0")]);
    expect(rows.at(-1)).toEqual(["total", "0", "0", "0", "0", "0", "13", "24", "18", "5", "1", "0", "0", "61"]);
    expect(expectTotalsAddUp(rows)).toBe(61);
  });

  // AC3.3 of #303: counts only, adding up to N with the outings counted below the table.
  it.each<[z.infer<typeof outingStatsSchema>["group_by"], z.infer<typeof outingStatsSchema>["group_by"], string[]]>([
    ["month", "condition", ["start month", "excellent", "good", "average", "poor", "awful", "dreadful", "(not given)"]],
    ["condition", "year", ["condition", "2024", "2025", "2026"]],
    ["year", "month", ["start year", ...MONTHS]],
  ])("counts odd outings by %s and %s below the table, adding up to N", async (group_by, split_by, header) => {
    serveDocuments(ODD);

    const result = await stats({ group_by, split_by });

    const rows = tableOf(result);
    expect(rows[0]).toEqual([...header, "total"]);
    expect(result).not.toContain("%");
    expect(result).toContain(COUNTS_NOTE);
    const below = belowTable(result);
    expect(below).toEqual(["(no start date): 2", "(unexpected format): 3"]);
    expect(expectTotalsAddUp(rows) + sum(below)).toBe(7);
  });

  it("escapes a | in a condition code Camptocamp sends, as a column and as a row", async () => {
    serveDocuments([innominata([1, "2026-07-03", "2026-07-05", "so|so"])]);

    const columns = tableOf(await stats({ group_by: "month", split_by: "condition" }))[0];
    const rows = tableOf(await stats({ group_by: "condition", split_by: "month" }));

    expect(columns).toContain("so\\|so");
    expect(rows.map((row) => row[0])).toContain("so\\|so");
  });

  it("prints no table when no outing has a start year, and the period Note", async () => {
    serveDocuments([{ ...innominata([1, "", "2026-07-05", "good"]), date_start: null }]);

    const result = await stats({ period_start: "06-01", period_end: "06-30", group_by: "year", split_by: "month" });

    expect(result).toBe(
      [
        "1 outing(s) counted (all matches), by start year and start month",
        "Filters: period 06-01 → 06-30 of every year",
        PERIOD_NOTE,
        COUNTS_NOTE,
        "",
        "(no start date): 1",
      ].join("\n"),
    );
  });

  // AC3.4 of #303: refused before any request, and before the filters are checked.
  it.each(["month", "year", "condition"] as const)("refuses split_by %s equal to group_by", async (axis) => {
    await expect(stats({ route_id: 54513, route_ids: [1148298], group_by: axis, split_by: axis })).rejects.toThrow(
      `split_by must differ from group_by (${axis}): give another of month, year, condition or route, or leave it out`,
    );
    expect(mockSearchOutings).not.toHaveBeenCalled();
  });

  it("checks the filters before any request", async () => {
    await expect(
      stats({ period_start: "12-20", period_end: "01-10", group_by: "month", split_by: "year" }),
    ).rejects.toThrow("period cannot wrap around the new year");
    expect(mockSearchOutings).not.toHaveBeenCalled();
  });
});

// Answers each search with its set's pages of 100, after 1 ms so that calls overlap, and tracks the calls in flight.
// A set is found by its `r` value: the route_ids joined by commas, or the route_id.
function serveRouteSets(sets: Record<string, unknown[]>) {
  const tracker = { inFlight: 0, maxInFlight: 0 };
  mockSearchOutings.mockImplementation(async (params?: OutingSearchParams) => {
    tracker.inFlight++;
    tracker.maxInFlight = Math.max(tracker.maxInFlight, tracker.inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    tracker.inFlight--;
    const documents = sets[params?.route_ids?.join(",") ?? String(params?.route_id)] ?? [];
    const offset = params?.offset ?? 0;
    return { total: documents.length, documents: documents.slice(offset, offset + 100) } as unknown as OutingListResponse;
  });
  return tracker;
}

const INNOMINATA_SETS = {
  "54513,54684,1148298": THREE_ROUTES.map(innominata),
  54513: INNOMINATA.map(innominata),
  54684: ROUTE_54684.map(innominata),
  1148298: ROUTE_1148298.map(innominata),
};

// The `r` value of each search sent, in order.
const sentRoutes = () => mockSearchOutings.mock.calls.map(([params]) => params?.route_ids?.join(",") ?? params?.route_id);

const outings = (first: number, count: number) => Array.from({ length: count }, (_, i) => outing(first + i));

const OVERLAP_6 = "6 outing(s) are linked to more than one of these routes and count under each.";

// S4 of #303: one column per route of route_ids, and the union's distinct outings in an `all routes` column.
describe("handleOutingStats with split_by route", () => {
  // AC4.1 of #303.
  it("counts the outings of routes 54513, 54684 and 1148298 by start year, per route and in all", async () => {
    serveRouteSets(INNOMINATA_SETS);

    const result = await stats({ route_ids: [54513, 54684, 1148298], group_by: "year", split_by: "route" });

    const counted: Record<string, string> = {
      ...{ 1994: "1 | 0 | 0 | 1", 2002: "1 | 0 | 0 | 1", 2003: "1 | 1 | 0 | 2", 2005: "3 | 0 | 0 | 3" },
      ...{ 2006: "1 | 3 | 0 | 4", 2007: "3 | 1 | 0 | 4", 2008: "3 | 0 | 0 | 3", 2009: "1 | 4 | 0 | 5" },
      ...{ 2011: "2 | 0 | 0 | 2", 2012: "3 | 2 | 0 | 5", 2013: "4 | 0 | 0 | 4", 2014: "4 | 0 | 0 | 4" },
      ...{ 2015: "4 | 0 | 0 | 4", 2016: "9 | 2 | 0 | 11", 2017: "1 | 3 | 0 | 3", 2018: "4 | 1 | 0 | 5" },
      ...{ 2019: "0 | 1 | 1 | 2", 2020: "0 | 1 | 0 | 1", 2021: "1 | 0 | 0 | 1", 2022: "3 | 1 | 0 | 4" },
      ...{ 2023: "5 | 2 | 0 | 6", 2024: "3 | 2 | 0 | 3", 2025: "2 | 3 | 0 | 4", 2026: "2 | 3 | 0 | 4" },
    };
    const years = Array.from({ length: 33 }, (_, i) => String(1994 + i));
    expect(result).toBe(
      [
        "86 outing(s) counted (all matches), by start year and route",
        "Filters: routes 54513 or 54684 or 1148298",
        COUNTS_NOTE,
        OVERLAP_6,
        "",
        "| start year | 54513 | 54684 | 1148298 | all routes |",
        "| --- | ---: | ---: | ---: | ---: |",
        ...years.map((year) => `| ${year} | ${counted[year] ?? "0 | 0 | 0 | 0"} |`),
        "| total | 61 | 30 | 1 | 86 |",
      ].join("\n"),
    );
  });

  // AC4.2 of #303: the union first, then one search per route, in input order.
  it("sends 4 searches, the union first, then each route", async () => {
    serveRouteSets(INNOMINATA_SETS);

    await stats({ route_ids: [54513, 54684, 1148298], activity: "mountain_climbing", group_by: "year", split_by: "route" });

    const page0 = { activity: "mountain_climbing", limit: 100, offset: 0, tiebreak_by_id: true };
    expect(mockSearchOutings.mock.calls).toEqual([
      [{ ...page0, route_ids: [54513, 54684, 1148298] }],
      [{ ...page0, route_id: 54513 }],
      [{ ...page0, route_id: 54684 }],
      [{ ...page0, route_id: 1148298 }],
    ]);
  });

  it("gives the union's counts in the all routes column, and each route's in its column", async () => {
    serveRouteSets(INNOMINATA_SETS);

    const rows = tableOf(await stats({ route_ids: [54513, 54684, 1148298], group_by: "month", split_by: "route" }));
    const union = (await stats({ route_ids: [54513, 54684, 1148298], group_by: "month" })).split("\n\n")[1];
    const innominata = (await stats({ route_id: 54513, group_by: "month" })).split("\n\n")[1];

    expect(rows.slice(1, -1).map((row) => `${row[0]}: ${row[4]}`)).toEqual(union.split("\n"));
    expect(rows.slice(1, -1).map((row) => `${row[0]}: ${row[1]}`)).toEqual(innominata.split("\n"));
    expect(rows.find((row) => row[0] === "07")).toEqual(["07", "24", "16", "0", "35"]);
    expect(rows.at(-1)).toEqual(["total", "61", "30", "1", "86"]);
  });

  it("counts them by condition, with the codes of every route", async () => {
    serveRouteSets(INNOMINATA_SETS);

    const rows = tableOf(await stats({ route_ids: [54513, 54684, 1148298], group_by: "condition", split_by: "route" }));

    expect(rows.slice(1)).toEqual([
      ["excellent", "12", "3", "0", "15"],
      ["good", "24", "11", "0", "32"],
      ["average", "7", "6", "0", "10"],
      ["poor", "0", "1", "0", "1"],
      ["awful", "1", "0", "0", "1"],
      ["(not given)", "17", "9", "1", "27"],
      ["total", "61", "30", "1", "86"],
    ]);
  });

  it("sends and prints a repeated route once, in first-seen order", async () => {
    serveRouteSets({ ...INNOMINATA_SETS, "54684,54513": THREE_ROUTES.filter(([id]) => id !== 1148311).map(innominata) });

    const result = await stats({ route_ids: [54684, 54513, 54684], group_by: "year", split_by: "route" });

    expect(sentRoutes()).toEqual(["54684,54513", 54684, 54513]);
    expect(result).toContain("\n| start year | 54684 | 54513 | all routes |\n");
    expect(result).toContain("\n| total | 30 | 61 | 85 |");
    expect(result).toContain(OVERLAP_6);
  });

  // The outings outside the table are counted once, from the union, so the all routes column and them add up to N.
  it("counts odd outings below the table, once, and says when no outing is shared", async () => {
    serveRouteSets({ "1,2": [...ODD, outing(8)], 1: ODD, 2: [outing(8)] });

    const result = await stats({ route_ids: [1, 2], group_by: "month", split_by: "route" });

    const rows = tableOf(result);
    expect(rows[0]).toEqual(["start month", "1", "2", "all routes"]);
    expect(rows.find((row) => row[0] === "07")).toEqual(["07", "2", "1", "3"]);
    expect(rows.at(-1)).toEqual(["total", "2", "1", "3"]);
    expect(belowTable(result)).toEqual(["(no start date): 2", "(unexpected format): 3"]);
    expect(result).toContain("\n0 outing(s) are linked to more than one of these routes and count under each.\n");
  });

  it("prints no table when no outing has a start year", async () => {
    const undated = { ...innominata([1, "", "2026-07-05", "good"]), date_start: null };
    serveRouteSets({ "1,2": [undated], 1: [undated], 2: [undated] });

    const result = await stats({ route_ids: [1, 2], group_by: "year", split_by: "route" });

    expect(result).toBe(
      [
        "1 outing(s) counted (all matches), by start year and route",
        "Filters: routes 1 or 2",
        COUNTS_NOTE,
        "1 outing(s) are linked to more than one of these routes and count under each.",
        "",
        "(no start date): 1",
      ].join("\n"),
    );
  });

  it.each<[string, Omit<z.input<typeof outingStatsSchema>, "group_by">, string]>([
    ["without route_ids", {}, 'split_by "route" counts the routes of route_ids'],
    ["with route_id alone", { route_id: 54513 }, 'split_by "route" counts the routes of route_ids'],
    ["with route_id and route_ids", { route_id: 54513, route_ids: [54684] }, "give route_id or route_ids, not both"],
  ])("refuses split_by route %s before any request", async (_label, input, message) => {
    await expect(stats({ ...input, group_by: "year", split_by: "route" })).rejects.toThrow(message);
    expect(mockSearchOutings).not.toHaveBeenCalled();
  });

  // AC4.2 of #303: an outing on several routes is read once per route, so the routes' totals are what is read.
  it("refuses per-route totals over 2,000 after the first pages, with each route's total and the sum", async () => {
    serveRouteSets({ "1,2": outings(1, 2000), 1: outings(1, 1500), 2: outings(1401, 600) });

    await expect(stats({ route_ids: [1, 2], group_by: "year", split_by: "route" })).rejects.toThrow(
      "2,100 outings match these filters route by route (route 1: 1,500, route 2: 600), more than the 2,000 that " +
        "can be counted in one call: narrow the filters (dates, area, activity, routes…) and call again.",
    );
    expect(sentRoutes()).toEqual(["1,2", 1, 2]);
  });

  it("reads per-route totals of exactly 2,000, at most 3 requests in flight", async () => {
    const tracker = serveRouteSets({ "1,2": outings(1, 1900), 1: outings(1, 1500), 2: outings(1401, 500) });

    const result = await stats({ route_ids: [1, 2], group_by: "year", split_by: "route" });

    expect(mockSearchOutings).toHaveBeenCalledTimes(19 + 15 + 5);
    expect(tracker.maxInFlight).toBe(3);
    expect(result).toContain("\n| total | 1500 | 500 | 1900 |");
    expect(result).toContain("\n100 outing(s) are linked to more than one of these routes and count under each.\n");
  });

  it.each<[string, Record<string, unknown[]>]>([
    ["holds an outing no route has", { "1,2": [outing(1), outing(2), outing(3)], 1: [outing(1)], 2: [outing(2)] }],
    ["misses an outing of a route", { "1,2": [outing(1)], 1: [outing(1)], 2: [outing(2)] }],
  ])("fails when the union %s", async (_label, sets) => {
    serveRouteSets(sets);

    await expect(stats({ route_ids: [1, 2], group_by: "year", split_by: "route" })).rejects.toThrow(
      "Camptocamp's results changed while counting; call again.",
    );
  });

  it("fails after the first pages when the union holds more outings than the routes", async () => {
    serveRouteSets({ "1,2": outings(1, 250), 1: outings(1, 100), 2: outings(101, 100) });

    await expect(stats({ route_ids: [1, 2], group_by: "year", split_by: "route" })).rejects.toThrow(
      "results changed while counting",
    );
    expect(sentRoutes()).toEqual(["1,2", 1, 2]);
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

  it("takes an optional split_by, one of month, year, condition or route", () => {
    expect(outingStatsSchema.parse({ group_by: "month" })).toEqual({ group_by: "month" });
    expect(outingStatsSchema.parse({ group_by: "month", split_by: "year" }).split_by).toBe("year");
    expect(outingStatsSchema.parse({ group_by: "month", split_by: "route" }).split_by).toBe("route");
    expect(outingStatsSchema.safeParse({ group_by: "month", split_by: "week" }).error?.issues[0].message).toBe(
      "must be one of: month, year, condition, route",
    );
    expect(outingStatsSchema.safeParse({ group_by: "route" }).error?.issues[0].message).toBe(
      "must be one of: month, year, condition",
    );
  });

  it("describes split_by and the table, counts only", () => {
    expect(definition.description).toContain("split_by");
    expect(definition.description).toContain("total row and column");
    expect(definition.description).not.toContain("%");
  });

  it("describes split_by route: route_ids, an all routes column, and outings counted under each route", () => {
    expect(definition.description).toContain("route (with route_ids)");
    expect(definition.description).toContain("'all routes'");
    expect(definition.description).toContain("under each");
  });

  it("keeps its description under 2,048 characters, with lang, the limit and how to read the reports", () => {
    expect(definition.name).toBe("outing_stats");
    expect(definition.description.length).toBeLessThan(2048);
    expect(definition.description).toContain(LANG_NOTE);
    expect(definition.description).toContain("more than 2,000");
    expect(definition.description).toContain("get_outings");
  });
});
