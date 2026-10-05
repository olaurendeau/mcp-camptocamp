import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectMatchingOutings } from "../../src/tools/outing-stats.js";
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
