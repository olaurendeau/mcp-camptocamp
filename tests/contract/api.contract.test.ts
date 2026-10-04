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
  searchUserOutings,
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

  it("outings in area 14403", async () => {
    expectNonEmptySearch(await searchOutings({ area_id: 14403 }));
  });

  it("outings of user 430052", async () => {
    expectNonEmptySearch(await searchUserOutings({ user_id: 430052 }));
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

    expect(route).toBeDefined();
    expect(route?.locales.map((locale) => locale.lang)).toEqual(["en"]);
  });
});

// authorSchema falls back to null on a malformed author, so a renamed field would silently drop the
// Author line everywhere: documents that carry an author must keep it after parsing.
describe("authors survive parsing", () => {
  const AUTHOR = { name: expect.any(String), user_id: expect.any(Number) };

  it("article 716039", async () => {
    const article = await getArticle(716039);

    expect(article.author).toEqual(AUTHOR);
  });

  // The outing detail (/outings/{id}) has no `author` key at all, only associations.users;
  // the outing searches are where the API sends it.
  it("outings of user 430052", async () => {
    const result = await searchUserOutings({ user_id: 430052 });

    expect(result.documents.length).toBeGreaterThan(0);
    for (const outing of result.documents) expect(outing.author).toEqual(AUTHOR);
  });

  it("outings in area 14403", async () => {
    const result = await searchOutings({ area_id: 14403 });

    expect(result.documents.length).toBeGreaterThan(0);
    for (const outing of result.documents) expect(outing.author).toEqual(AUTHOR);
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
