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
  type OutingListResponse,
} from "../../src/api/camptocamp.js";
import { isMalformed, type MalformedItem } from "../../src/api/schemas.js";
import { pickLocale, type ListOf } from "../../src/tools/format.js";
import { handleGetRoute } from "../../src/tools/routes.js";
import { handleGetWaypoint } from "../../src/tools/waypoints.js";
import { handleGetOuting } from "../../src/tools/outings.js";
import { handleOutingStats } from "../../src/tools/outing-stats.js";
import { handleGetBook } from "../../src/tools/books.js";
import { handleGetArticle } from "../../src/tools/articles.js";
import { wellFormed } from "../api/well-formed.js";

interface Document {
  document_id: number;
  locales: { lang: string; title: string }[];
}

// A search document the schema could not parse is a MalformedItem; wellFormed fails the test on one.
interface Search {
  documents: readonly (Document | MalformedItem)[];
  total: number;
}

// authorSchema falls back to null on a malformed author, so a renamed field would silently drop the
// Author line everywhere: documents that carry an author must keep it after parsing.
const AUTHOR: Record<string, unknown> = { name: expect.any(String), user_id: expect.any(Number) };

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
  for (const document of wellFormed(result.documents)) {
    expect(document.document_id).toBeGreaterThan(0);
    expect(document.locales.length).toBeGreaterThan(0);
  }
}

// The API silently ignores an unknown parameter or value (`conf=nonsense` returns the unfiltered total),
// so a renamed or dropped filter only shows as a total equal to the unfiltered one: a filter must match
// something, and fewer documents than the same search without it.
function expectNarrows(filtered: Search, unfiltered: Search): void {
  expectNonEmptySearch(filtered);
  expect(filtered.total, `filtered total ${filtered.total}, unfiltered ${unfiltered.total}`).toBeLessThan(
    unfiltered.total,
  );
}

// Whether the filter reads the intended field: most results carry the filtered value. Not all of them: the
// search index lags edits (route 1698307, a hiking route without ski rating, still matched `trat=3.1,4.1`).
function expectMostMatch<T extends { document_id: number }>(
  documents: T[],
  matches: (document: T) => boolean,
  filter: string,
): void {
  const others = documents.filter((document) => !matches(document)).map((document) => document.document_id);
  expect(others.length, `results not matching ${filter}: ${others.join(", ")}`).toBeLessThan(documents.length / 2);
}

// One request per unfiltered search, shared by the tests that compare against it.
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let result: Promise<T> | undefined;
  return () => (result ??= load());
}

// The order of `sort=-date_end,-id`, checked on a page that has at least one same-day tie, so that the ID
// key is exercised.
function expectStrictlyByDateEndThenIdDescending(result: OutingListResponse): void {
  const outings = wellFormed(result.documents).map((outing) => ({
    date: outing.date_end ?? "",
    id: outing.document_id,
  }));
  expect(
    outings.some((outing, i) => i > 0 && outing.date === outings[i - 1].date),
    "no same-day tie",
  ).toBe(true);
  for (let i = 1; i < outings.length; i++) {
    const [previous, current] = [outings[i - 1], outings[i]];
    const ordered = previous.date > current.date || (previous.date === current.date && previous.id > current.id);
    expect(ordered, `outing ${current.id} (${current.date}) after ${previous.id} (${previous.date})`).toBe(true);
  }
}

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

const VANOISE = 14409;
const routesInVanoise = once(() => searchRoutes({ area_id: VANOISE }));
const mountBlancBooks = once(() => searchBooks({ query: "Mont Blanc" }));
const allOutings = once(() => searchOutings());
const outingsAtWaypoint37916 = once(() => searchOutings({ waypoint_id: 37916 }));
const skitouringOutingsInVanoise = once(() => searchOutings({ area_id: VANOISE, activity: "skitouring" }));
const goodSkitouringOutingsInVanoise = once(() =>
  searchOutings({ area_id: VANOISE, activity: "skitouring", condition_at_least: "good" }),
);

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
    for (const outing of wellFormed(result.documents)) expect(outing.author).toEqual(AUTHOR);
  });

  // `u=`, behind search_outings {user_id} and its search_user_outings alias. It matches the outings the user
  // is listed on (associations.users), not only those they wrote: the author may be someone else.
  it("outings of user 430052, each with an author, fewer than all outings", async () => {
    const result = await searchOutings({ user_id: 430052 });

    expectNarrows(result, await allOutings());
    for (const outing of wellFormed(result.documents)) expect(outing.author).toEqual(AUTHOR);
  });

  it("outings of user 466185 on 2025-03-31 include 1757161, written by user 944173", async () => {
    const result = await searchOutings({ user_id: 466185, date_from: "2025-03-31", date_to: "2025-03-31" });
    const outing = wellFormed(result.documents).find((document) => document.document_id === 1757161);

    expect(outing, "outing 1757161 is no longer found by u=466185").toBeDefined();
    expect(outing?.author).toEqual({ ...AUTHOR, user_id: 944173 });
  });

  // get_outing prints associations.users; a renamed key would silently drop its line.
  it("outing 1757161 lists its linked users 466185 and 944173", async () => {
    const outing = await getOuting(1757161);

    expect(wellFormed(outing.associations?.users).map((user) => user.document_id)).toEqual([466185, 944173]);
  });

  // get_outing prints `**Partial trip**: yes` from partial_trip; a renamed key would silently drop the line.
  it("outing 219347 is a partial trip; 1924138 and 669600 send a boolean or null", async () => {
    expect((await getOuting(219347)).partial_trip).toBe(true);
    for (const id of [1924138, 669600]) {
      const { partial_trip } = await getOuting(id);
      expect(partial_trip === null || typeof partial_trip === "boolean", `outing ${id}: ${String(partial_trip)}`).toBe(
        true,
      );
    }
  });

  // `period=2020-06-01,2020-06-30`: the same days in every year.
  // An outing may start or end outside June (05-30 → 06-02): it only has to overlap a June.
  it("outings at waypoint 37916 in the period 06-01 → 06-30, each overlapping June, fewer than all its outings", async () => {
    const result = await searchOutings({ waypoint_id: 37916, period: { start: "06-01", end: "06-30" } });

    expectNarrows(result, await outingsAtWaypoint37916());
    for (const outing of wellFormed(result.documents)) {
      const start = outing.date_start ?? outing.date_end ?? "";
      const end = outing.date_end ?? outing.date_start ?? "";
      expect(overlapsJune(start, end), `outing ${outing.document_id} (${start} → ${end})`).toBe(true);
    }
  });

  // #251, AC0.4: a period starting on 01-01 matched nothing while it was sent as 2020-01-01 (day 365.1 of the
  // API's 365.2425-day year). Adding 01-01 to 01-02 → 01-31 can only add outings.
  it("outings in the period 01-01 → 01-31, at least as many as in 01-02 → 01-31", async () => {
    const january = await searchOutings({ period: { start: "01-01", end: "01-31" }, limit: 1 });
    const fromSecond = await searchOutings({ period: { start: "01-02", end: "01-31" }, limit: 1 });

    expect(january.total).toBeGreaterThan(0);
    expect(january.total).toBeGreaterThanOrEqual(fromSecond.total);
  });

  // `sort=-date_end,-id` (tiebreak_by_id), which outing counts page through: a strict order, so pages of
  // 100 neither skip nor repeat an outing. Route 54513 has outings ending the same day (2016-07-08).
  it("outings of route 54513 with tiebreak_by_id, all on one page of 100, by (date_end, id) descending", async () => {
    const result = await searchOutings({ route_id: 54513, tiebreak_by_id: true, limit: 100 });

    expect(result.documents).toHaveLength(Math.min(result.total, 100));
    expectStrictlyByDateEndThenIdDescending(result);
  });

  // Plain `-date_end` returns same-day ties of route 54513 in descending ID order anyway. The latest 100
  // outings tell the two sorts apart: without `-id`, 63 of their 94 ties came back ascending (2026-10-05).
  it("the latest 100 outings with tiebreak_by_id, by (date_end, id) descending", async () => {
    expectStrictlyByDateEndThenIdDescending(await searchOutings({ tiebreak_by_id: true, limit: 100 }));
  });

  // outing_stats reads pages of 100 (collectMatchingOutings): if Camptocamp served fewer, every count over one
  // page would fail with "results changed while counting; call again", on every call.
  it("a full page of 100 outings at limit 100, past the first page", async () => {
    const result = await searchOutings({ tiebreak_by_id: true, limit: 100, offset: 100 });

    expect(result.total).toBeGreaterThan(200);
    expect(result.documents).toHaveLength(100);
  });

  // S4 on #255: every outing of route 54513 counted once, in 12 month lines that add up to the header's total.
  it("outing_stats counts the outings of route 54513 by start month", async () => {
    const [header, , , , ...lines] = (await handleOutingStats({ route_id: 54513, group_by: "month" })).split("\n");
    const total = Number(/^(\d+) outing\(s\) counted \(all matches\), by start month$/.exec(header)?.[1]);
    const counts = lines.map((line) => /^(\d{2}): (\d+)$/.exec(line));

    expect(total).toBeGreaterThan(0);
    expect(counts.map((match) => match?.[1])).toEqual(MONTHS);
    expect(counts.reduce((sum, match) => sum + Number(match?.[2]), 0)).toBe(total);
  });

  // S3 of #303: the month × condition table's total column gives the group_by month lines.
  it("outing_stats counts the outings of route 54513 by start month and condition", async () => {
    const byMonth = (await handleOutingStats({ route_id: 54513, group_by: "month" })).split("\n").slice(4);
    const table = await handleOutingStats({ route_id: 54513, group_by: "month", split_by: "condition" });
    const rows = table
      .split("\n")
      .filter((line) => /^\| \d{2} \|/.test(line))
      .map((line) => line.slice(2, -2).split(" | "));

    expect(table.split("\n")[0]).toMatch(/^\d+ outing\(s\) counted \(all matches\), by start month and condition$/);
    expect(table).toContain("| start month | excellent | good | average | poor | awful |");
    expect(rows.map((row) => `${row[0]}: ${row.at(-1) ?? ""}`)).toEqual(byMonth);
  });

  // S4 of #303: with two routes, the routes' totals less the shared outings give the union's total, the header's.
  it("outing_stats counts the outings of routes 54513 and 54684 per route and in all", async () => {
    const table = await handleOutingStats({ route_ids: [54513, 54684], group_by: "month", split_by: "route" });
    const lines = table.split("\n");
    const total = Number(/^(\d+) outing\(s\) counted \(all matches\), by start month and route$/.exec(lines[0])?.[1]);
    const overlap = /^(\d+) outing\(s\) are linked to more than one of these routes and count under each\.$/;
    const shared = Number(lines.map((line) => overlap.exec(line)).find(Boolean)?.[1]);
    const rows = lines
      .filter((line) => /^\| (\d{2}|total) \|/.test(line))
      .map((line) => line.slice(2, -2).split(" | "));
    const [, first, second, all] = (rows.at(-1) ?? []).map(Number);

    expect(table).toContain("\n| start month | 54513 | 54684 | all routes |\n");
    expect(rows.map((row) => row[0])).toEqual([...MONTHS, "total"]);
    expect(total).toBeGreaterThan(0);
    expect(all).toBe(total);
    expect(first + second - shared).toBe(total);
  });

  it("areas by keyword", async () => {
    expectNonEmptySearch(await searchAreas({ query: "Ecrins" }));
  });

  it("books by keyword", async () => {
    expectNonEmptySearch(await mountBlancBooks());
  });

  it("articles by keyword", async () => {
    expectNonEmptySearch(await searchArticles({ query: "corde" }));
  });

  // AC3.4: with `pl=fr`, a search returns one locale per document, the API's fallback when there is no fr
  // (the detail of route 675555 has both it and en).
  it("route 675555 comes back from a search with its single en locale", async () => {
    const result = await searchRoutes({ query: "Dente del Resegone" });
    const route = wellFormed(result.documents).find((document) => document.document_id === 675555);
    const found = wellFormed(result.documents)
      .map((document) => document.document_id)
      .join(", ");

    expect(route, `route 675555 is not in the results anymore (found: ${found}); pick another route`).toBeDefined();
    expect(
      route?.locales.map((locale) => locale.lang),
      "route 675555 is found but its locale changed: pl=fr no longer returns the API's single fallback locale",
    ).toEqual(["en"]);
  });

  // AC5.2, AC5.3: `pl=<lang>` returns the requested language instead of fr (route 54085 had a de locale on
  // 2026-10-04).
  it("route 54085 comes back from a de search with its single de locale", async () => {
    const result = await searchRoutes({ query: "Glacier du Geay", lang: "de" });
    const route = wellFormed(result.documents).find((document) => document.document_id === 54085);
    const found = wellFormed(result.documents)
      .map((document) => document.document_id)
      .join(", ");

    expect(route, `route 54085 is not in the results anymore (found: ${found}); pick another route`).toBeDefined();
    expect(
      route?.locales.map((locale) => locale.lang),
      "route 54085 is found but its locale changed: pl=de no longer returns the single de locale",
    ).toEqual(["de"]);
  });
});

// #203: the server instructions and LANG_NOTE state that a document without the requested language comes in
// the first available of LANG_ORDER; on searches the API picks it through `pl`. Each route below lacks the
// requested language (its languages as of 2026-10-04, in the detail's order). `notFirst` says whether the detail
// lists the expected language after another one, so that a pick of the first locale would fail: true for all
// but 480854 and 327059, which list es first and only show that the API does not prefer ca or eu. Pairs covered:
// fr before en, sl and es, en before ca, it before de, sl and es, es before ca, eu and sl; en before it is the
// AC3.4 case above.
describe("searches fall back to the first available of LANG_ORDER (#203)", () => {
  it.each([
    [668432, "Tominskova", "de", ["en", "fr", "sl"], "fr", true],
    [925530, "Via dei Camini", "de", ["es", "fr"], "fr", true],
    [326458, "Volta al massis de Montserrat", "fr", ["ca", "en"], "en", true],
    [47328, "Za Cmirom", "fr", ["sl", "de", "it"], "it", true],
    [47328, "Za Cmirom", "en", ["sl", "de", "it"], "it", true],
    [1196778, "Via dei Camini", "de", ["es", "it"], "it", true],
    [480854, "GEDE Montserrat", "fr", ["es", "ca"], "es", false],
    [327059, "Kanal Haundi", "ca", ["es", "eu"], "es", false],
    [1268880, "Prusik Szalay", "it", ["sl", "es"], "es", true],
  ] as const)(
    "route %i (search %j, lang %s, languages %j) comes back in %s",
    async (id, query, lang, langs, expected, notFirst) => {
      const [result, detail] = await Promise.all([searchRoutes({ query, lang }), getRoute(id)]);
      const route = wellFormed(result.documents).find((document) => document.document_id === id);
      const found = wellFormed(result.documents)
        .map((document) => document.document_id)
        .join(", ");

      expect(route, `route ${id} is not in the results anymore (found: ${found}); pick another route`).toBeDefined();
      expect(
        detail.locales.map((locale) => locale.lang).sort(),
        `route ${id}'s languages changed: it no longer tests this fallback; pick another route`,
      ).toEqual([...langs].sort());
      expect(
        detail.locales[0]?.lang !== expected,
        notFirst
          ? `route ${id} now lists ${expected} first: a pick of the first locale would pass; pick another route`
          : `route ${id} no longer lists ${expected} first: set its notFirst to true`,
      ).toBe(notFirst);
      expect(
        route?.locales.map((locale) => locale.lang),
        `pl=${lang} on [${langs.join(", ")}] no longer returns ${expected}: the API's fallback order changed`,
      ).toEqual([expected]);
      expect(
        pickLocale(detail.locales, lang)?.lang,
        `LANG_ORDER no longer picks ${expected}, the API's choice, from [${langs.join(", ")}]`,
      ).toBe(expected);
    },
  );
});

// Each filter of search_routes, search_waypoints, search_outings and search_books narrows the same search
// without it; the outing filters `u` and `period` are checked the same way in "searches". Where the search
// results carry the filtered field, most results must also carry the filtered value.
describe("search filters narrow live results", () => {
  describe(`routes in Vanoise (area ${VANOISE})`, () => {
    it("act: activity skitouring", async () => {
      const result = await searchRoutes({ area_id: VANOISE, activity: "skitouring" });

      expectNarrows(result, await routesInVanoise());
      expectMostMatch(
        wellFormed(result.documents),
        (route) => route.activities.includes("skitouring"),
        "act=skitouring",
      );
    });

    it("trat: ski rating 3.1 → 4.1", async () => {
      const result = await searchRoutes({ area_id: VANOISE, rating: { system: "ski_rating", min: "3.1", max: "4.1" } });

      expectNarrows(result, await routesInVanoise());
      const inRange = ["3.1", "3.2", "3.3", "4.1"];
      expectMostMatch(
        wellFormed(result.documents),
        (route) => inRange.includes(route.ski_rating ?? ""),
        "trat=3.1,4.1",
      );
    });

    it("hdif: height difference up 1500 → 2000 m", async () => {
      const result = await searchRoutes({ area_id: VANOISE, height_diff_up: { min: 1500, max: 2000 } });

      expectNarrows(result, await routesInVanoise());
      const inRange = (up?: number | null) => up != null && up >= 1500 && up <= 2000;
      expectMostMatch(wellFormed(result.documents), (route) => inRange(route.height_diff_up), "hdif=1500,2000");
    });

    // Route types and configuration are not in the search results: only the totals tell.
    it("rtyp: route type traverse", async () => {
      expectNarrows(await searchRoutes({ area_id: VANOISE, route_types: ["traverse"] }), await routesInVanoise());
    });

    it("conf: configuration edge", async () => {
      expectNarrows(await searchRoutes({ area_id: VANOISE, configuration: ["edge"] }), await routesInVanoise());
    });
  });

  // AC6.7 on #153.
  describe("outings, against all outings", () => {
    it("act: activity skitouring", async () => {
      const result = await searchOutings({ activity: "skitouring" });

      expectNarrows(result, await allOutings());
      expectMostMatch(
        wellFormed(result.documents),
        (outing) => outing.activities.includes("skitouring"),
        "act=skitouring",
      );
    });

    it(`a: area ${VANOISE}`, async () => {
      const result = await searchOutings({ area_id: VANOISE });

      expectNarrows(result, await allOutings());
      expectMostMatch(
        wellFormed(result.documents),
        (outing) => outing.areas?.some((area) => area.document_id === VANOISE) ?? false,
        `a=${VANOISE}`,
      );
    });

    it("date: 2026-01-01 → 2026-03-31", async () => {
      const result = await searchOutings({ date_from: "2026-01-01", date_to: "2026-03-31" });

      expectNarrows(result, await allOutings());
      expectMostMatch(
        wellFormed(result.documents),
        (outing) => (outing.date_start ?? "") <= "2026-03-31" && (outing.date_end ?? "") >= "2026-01-01",
        "date=2026-01-01,2026-03-31",
      );
    });

    // The outing's routes are not in the search results: only the totals tell.
    it("r: route 53884", async () => {
      expectNarrows(await searchOutings({ route_id: 53884 }), await allOutings());
    });

    // S2 on #255: `r=a,b` is an OR that lists an outing linked to both routes once (54513 and 54684 share some).
    it("r: routes 54513 or 54684, at least each route's total and at most their sum", async () => {
      const [either, first, second] = await Promise.all([
        searchOutings({ route_ids: [54513, 54684] }),
        searchOutings({ route_id: 54513 }),
        searchOutings({ route_id: 54684 }),
      ]);

      expectNonEmptySearch(first);
      expectNonEmptySearch(second);
      expect(either.total).toBeGreaterThanOrEqual(Math.max(first.total, second.total));
      expect(either.total).toBeLessThanOrEqual(first.total + second.total);
      expectNarrows(either, await allOutings());
    });
  });

  describe(`skitouring outings in Vanoise (area ${VANOISE})`, () => {
    const base = { area_id: VANOISE, activity: "skitouring" };

    it("trat: ski rating 3.1 → 4.1", async () => {
      const result = await searchOutings({ ...base, rating: { system: "ski_rating", min: "3.1", max: "4.1" } });

      expectNarrows(result, await skitouringOutingsInVanoise());
      const inRange = ["3.1", "3.2", "3.3", "4.1"];
      expectMostMatch(
        wellFormed(result.documents),
        (outing) => inRange.includes(outing.ski_rating ?? ""),
        "trat=3.1,4.1",
      );
    });

    it("ocond: conditions good or better", async () => {
      const result = await goodSkitouringOutingsInVanoise();

      expectNarrows(result, await skitouringOutingsInVanoise());
      expectMostMatch(
        wellFormed(result.documents),
        (outing) => ["excellent", "good"].includes(outing.condition_rating ?? ""),
        "ocond=excellent,good",
      );
    });

    // `ocond=excellent,excellent`: the range's two ends are the same value, so only excellent outings match.
    it("ocond: conditions excellent, fewer than good or better", async () => {
      const result = await searchOutings({ ...base, condition_at_least: "excellent" });

      expectNarrows(result, await goodSkitouringOutingsInVanoise());
      expectMostMatch(
        wellFormed(result.documents),
        (outing) => outing.condition_rating === "excellent",
        "ocond=excellent,excellent",
      );
    });

    it("oalt: max elevation 3000 → 4000 m", async () => {
      const result = await searchOutings({ ...base, elevation_max: { min: 3000, max: 4000 } });

      expectNarrows(result, await skitouringOutingsInVanoise());
      const inRange = (elevation?: number | null) => elevation != null && elevation >= 3000 && elevation <= 4000;
      expectMostMatch(wellFormed(result.documents), (outing) => inRange(outing.elevation_max), "oalt=3000,4000");
    });

    it("odif: elevation gain 1000 → 1500 m", async () => {
      const result = await searchOutings({ ...base, height_diff_up: { min: 1000, max: 1500 } });

      expectNarrows(result, await skitouringOutingsInVanoise());
      const inRange = (up?: number | null) => up != null && up >= 1000 && up <= 1500;
      expectMostMatch(wellFormed(result.documents), (outing) => inRange(outing.height_diff_up), "odif=1000,1500");
    });
  });

  it(`wtyp: huts in Vanoise (area ${VANOISE})`, async () => {
    const [result, unfiltered] = await Promise.all([
      searchWaypoints({ area_id: VANOISE, waypoint_type: "hut" }),
      searchWaypoints({ area_id: VANOISE }),
    ]);

    expectNarrows(result, unfiltered);
    expectMostMatch(wellFormed(result.documents), (waypoint) => waypoint.waypoint_type === "hut", "wtyp=hut");
  });

  describe("books about Mont Blanc", () => {
    it("btyp: book type topo", async () => {
      const result = await searchBooks({ query: "Mont Blanc", book_type: "topo" });

      expectNarrows(result, await mountBlancBooks());
      expectMostMatch(wellFormed(result.documents), (book) => book.book_types?.includes("topo") ?? false, "btyp=topo");
    });

    it("act: activity skitouring", async () => {
      const result = await searchBooks({ query: "Mont Blanc", activity: "skitouring" });

      expectNarrows(result, await mountBlancBooks());
      expectMostMatch(
        wellFormed(result.documents),
        (book) => book.activities?.includes("skitouring") ?? false,
        "act=skitouring",
      );
    });
  });

  // AC3.7 of #210: an unknown value is ignored (`acat=bogus` returns every article), so each filter must
  // return fewer articles than the same search with an unknown value.
  describe("articles, against the same filter with an unknown value", () => {
    it("acat: category gear", async () => {
      const [result, unfiltered] = await Promise.all([
        searchArticles({ category: "gear" }),
        searchArticles({ category: "bogus" }),
      ]);

      expectNarrows(result, unfiltered);
      expectMostMatch(
        wellFormed(result.documents),
        (article) => article.categories?.includes("gear") ?? false,
        "acat=gear",
      );
    });

    it("atyp: article type personal", async () => {
      const [result, unfiltered] = await Promise.all([
        searchArticles({ article_type: "personal" }),
        searchArticles({ article_type: "bogus" }),
      ]);

      expectNarrows(result, unfiltered);
      expectMostMatch(wellFormed(result.documents), (article) => article.article_type === "personal", "atyp=personal");
    });

    it("act: activity skitouring", async () => {
      const [result, unfiltered] = await Promise.all([
        searchArticles({ activity: "skitouring" }),
        searchArticles({ activity: "bogus" }),
      ]);

      expectNarrows(result, unfiltered);
      expectMostMatch(
        wellFormed(result.documents),
        (article) => article.activities?.includes("skitouring") ?? false,
        "act=skitouring",
      );
    });
  });
});

// Documents that carry an author keep it after parsing (AUTHOR above); the outing searches check it in "searches".
describe("authors survive parsing", () => {
  it("article 716039", async () => {
    const article = await getArticle(716039);

    expect(article.author).toEqual(AUTHOR);
  });
});

// AC4.5 on #153: a list item the schema cannot parse becomes a placeholder line instead of failing the response,
// so shape drift in a list would go unnoticed. Each list must be non-empty with every item parsed, and the
// handler's output must have no placeholder.
describe("association lists keep every item (AC4.5)", () => {
  function expectListsWellFormed(lists: Record<string, ListOf<object> | null | undefined>): void {
    for (const [name, list] of Object.entries(lists)) {
      expect(list?.length ?? 0, `${name} is empty: pick another document`).toBeGreaterThan(0);
      expect(
        list?.filter((item) => isMalformed(item)),
        `${name}: items the schema could not parse`,
      ).toEqual([]);
    }
  }

  it("route 54085: waypoints, routes, books, recent outings, areas", async () => {
    const route = await getRoute(54085);

    const { waypoints, routes, books, recent_outings } = route.associations ?? {};
    expectListsWellFormed({ waypoints, routes, books, recent_outings: recent_outings?.documents, areas: route.areas });
    expect(await handleGetRoute({ id: 54085 })).not.toContain("not shown:");
  });

  it("waypoint 104151: routes, recent outings, areas", async () => {
    const waypoint = await getWaypoint(104151);

    const { all_routes, recent_outings } = waypoint.associations ?? {};
    expectListsWellFormed({
      all_routes: all_routes?.documents,
      recent_outings: recent_outings?.documents,
      areas: waypoint.areas,
    });
    expect(await handleGetWaypoint({ id: 104151 })).not.toContain("not shown:");
  });

  it("waypoint 37355: books", async () => {
    const waypoint = await getWaypoint(37355);

    expectListsWellFormed({ books: waypoint.associations?.books });
    expect(await handleGetWaypoint({ id: 37355 })).not.toContain("not shown:");
  });

  it("outing 1757161: routes, users", async () => {
    const outing = await getOuting(1757161);

    const { routes, users } = outing.associations ?? {};
    expectListsWellFormed({ routes, users });
    expect(await handleGetOuting({ id: 1757161 })).not.toContain("not shown:");
  });

  it("book 14643: routes, waypoints", async () => {
    const book = await getBook(14643);

    const { routes, waypoints } = book.associations ?? {};
    expectListsWellFormed({ routes, waypoints });
    expect(await handleGetBook({ id: 14643 })).not.toContain("not shown:");
  });

  // S5 of #303: get_book pages the route list in API order, which it relies on being ascending document_id.
  it("book 853932: more than 50 routes, in ascending document_id order", async () => {
    const routes = (await getBook(853932)).associations?.routes ?? [];
    const ids = routes.map((route) => (isMalformed(route) ? Number.NaN : route.document_id));

    expectListsWellFormed({ routes });
    expect(ids.length).toBeGreaterThan(50);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    const page = await handleGetBook({ id: 853932 });
    expect(page).toMatch(/\n## Associated routes \(1–50 of \d+\)\n/);
    expect(page).toContain("\nMore: get_book {id: 853932, routes_offset: 50}");
  });

  it("article 469577: routes, waypoints, articles, books", async () => {
    const article = await getArticle(469577);

    const { routes, waypoints, articles, books } = article.associations ?? {};
    expectListsWellFormed({ routes, waypoints, articles, books });
    expect(await handleGetArticle({ id: 469577 })).not.toContain("not shown:");
  });

  it("article 623671: outings", async () => {
    const article = await getArticle(623671);

    expectListsWellFormed({ outings: article.associations?.outings });
    expect(await handleGetArticle({ id: 623671 })).not.toContain("not shown:");
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
