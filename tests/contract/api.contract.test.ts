// Live contract tests: the production client (User-Agent, 15 s timeout, 10 MiB cap, zod shape validation)
// against the real Camptocamp API. They assert shape and identity, never content, so editorial changes on
// camptocamp.org do not break them; a failure means the API moved away from what the server expects.
// Run with `npm run test:contract` only: `npm test`, coverage and `make check` exclude this directory.
import { describe, expect, it } from "vitest";
import {
  getArea,
  getArticle,
  getBook,
  getOuting,
  getRoute,
  getWaypoint,
  searchArticles,
  searchAreas,
  searchBooks,
  searchOutings,
  searchRoutes,
  searchWaypoints,
} from "../../src/api/camptocamp.js";

interface Document {
  document_id: number;
  locales: { lang: string; title: string }[];
}

interface Search {
  documents: Document[];
  total: number;
}

// authorSchema falls back to null on a malformed author, so a renamed field would silently drop the
// Author line everywhere: documents that carry an author must keep it after parsing.
const AUTHOR = { name: expect.any(String), user_id: expect.any(Number) };

// Whether the dates start → end (YYYY-MM-DD) cover at least one day of June in some year.
function overlapsJune(start: string, end: string): boolean {
  const years = Number(end.slice(0, 4)) - Number(start.slice(0, 4));
  const [startDay, endDay] = [start.slice(5), end.slice(5)];
  if (years > 1) return true;
  if (years === 1) return startDay <= "06-30" || endDay >= "06-01";
  return start !== "" && startDay <= "06-30" && endDay >= "06-01";
}

// Shape beyond what the schemas already enforce: a search found something and each document has a locale.
function expectNonEmptySearch(result: Search): void {
  expect(result.documents.length).toBeGreaterThan(0);
  expect(result.total).toBeGreaterThanOrEqual(result.documents.length);
  for (const document of result.documents) {
    expect(document.document_id).toBeGreaterThan(0);
    expect(document.locales.length).toBeGreaterThan(0);
  }
}

describe("document details (AC8.2, AC8.3)", () => {
  it.each([
    ["route", 53914, getRoute],
    ["waypoint", 37355, getWaypoint],
    ["outing", 1805047, getOuting],
    ["area", 14403, getArea],
    ["book", 373877, getBook],
    ["article", 716039, getArticle],
  ] as const)("get %s %i returns that document", async (_type, id, get) => {
    const document: Document = await get(id);

    expect(document.document_id).toBe(id);
    expect(document.locales.length).toBeGreaterThan(0);
  });

  it("an unknown route is a 404 naming the route, with the API's JSON description", async () => {
    await expect(getRoute(999999999)).rejects.toThrow(/404 .*\(route 999999999\): document not found/);
  });

  // AC2.3, live half: the largest known response, streamed gzip/chunked without Content-Length,
  // stays under the 10 MiB cap.
  it("area 14067 (about 1.1 MB) is read whole", async () => {
    const area = await getArea(14067);

    expect(area.document_id).toBe(14067);
  });
});

describe("searches (AC8.2, AC8.3)", () => {
  it("routes by keyword", async () => {
    expectNonEmptySearch(await searchRoutes({ query: "Mont Blanc" }));
  });

  it("waypoints by keyword", async () => {
    expectNonEmptySearch(await searchWaypoints({ query: "Mont Blanc" }));
  });

  // The outing detail (/outings/{id}) has no `author` key at all, only associations.users;
  // the outing searches are where the API sends it.
  it("outings in area 14403, each with its author", async () => {
    const result = await searchOutings({ area_id: 14403 });

    expectNonEmptySearch(result);
    for (const outing of result.documents) expect(outing.author).toEqual(AUTHOR);
  });

  // `u=`, behind search_outings {user_id} and its search_user_outings alias.
  it("outings of user 430052, each by that user", async () => {
    const result = await searchOutings({ user_id: 430052 });

    expectNonEmptySearch(result);
    for (const outing of result.documents) expect(outing.author).toEqual({ ...AUTHOR, user_id: 430052 });
  });

  // `period=2020-06-01,2020-06-30`: the same days in every year.
  // An outing may start or end outside June (05-30 → 06-02): it only has to overlap a June.
  it("outings at waypoint 37916 in the period 06-01 → 06-30, each overlapping June", async () => {
    const result = await searchOutings({ waypoint_id: 37916, period: { start: "06-01", end: "06-30" } });

    expectNonEmptySearch(result);
    for (const outing of result.documents) {
      const start = outing.date_start ?? outing.date_end ?? "";
      const end = outing.date_end ?? outing.date_start ?? "";
      expect(overlapsJune(start, end), `outing ${outing.document_id} (${start} → ${end})`).toBe(true);
    }
  });

  it("areas by keyword", async () => {
    expectNonEmptySearch(await searchAreas({ query: "Ecrins" }));
  });

  it("books by keyword", async () => {
    expectNonEmptySearch(await searchBooks({ query: "Mont Blanc" }));
  });

  it("articles by keyword", async () => {
    expectNonEmptySearch(await searchArticles({ query: "corde" }));
  });

  // AC3.4: with `pl=fr`, a search returns one locale per document, the API's fallback when there is no fr
  // (the detail of route 675555 has both it and en).
  it("route 675555 comes back from a search with its single en locale", async () => {
    const result = await searchRoutes({ query: "Dente del Resegone" });
    const route = result.documents.find((document) => document.document_id === 675555);
    const found = result.documents.map((document) => document.document_id).join(", ");

    expect(route, `route 675555 is not in the results anymore (found: ${found}); pick another route`).toBeDefined();
    expect(
      route?.locales.map((locale) => locale.lang),
      "route 675555 is found but its locale changed: pl=fr no longer returns the API's single fallback locale",
    ).toEqual(["en"]);
  });
});

// Documents that carry an author keep it after parsing (AUTHOR above); the outing searches check it in "searches".
describe("authors survive parsing", () => {
  it("article 716039", async () => {
    const article = await getArticle(716039);

    expect(article.author).toEqual(AUTHOR);
  });
});

// documentId() accepts IDs up to Number.MAX_SAFE_INTEGER; check that the API treats one above 2^31
// as an ordinary ID rather than ignoring it.
describe("IDs above 2^31", () => {
  const BIG_ID = 3_000_000_000;

  it("as an area filter, it is applied: no route matches", async () => {
    const result = await searchRoutes({ area_id: BIG_ID });

    expect(result.documents).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("as a detail ID, it is a plain 404", async () => {
    await expect(getRoute(BIG_ID)).rejects.toThrow(/404 .*\(route 3000000000\): document not found/);
  });
});
