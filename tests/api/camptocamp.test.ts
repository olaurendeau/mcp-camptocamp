import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchRoutes,
  getRoute,
  searchWaypoints,
  getWaypoint,
  getOuting,
  searchAreas,
  getArea,
  searchOutings,
  searchBooks,
  getBook,
  searchArticles,
  getArticle,
} from "../../src/api/camptocamp.js";
import {
  ROUTE_RATING_FIELDS,
  ROUTE_RATING_PARAMS,
  OUTING_RATING_FIELDS,
  type OutingRatingField,
  type ConditionRating,
  type RouteRatingField,
} from "../../src/api/values.js";
import { outingDetailSchema, routeDetailSchema } from "../../src/api/schemas.js";
import { wellFormed } from "./well-formed.js";
import type { Lang } from "../../src/api/values.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(data: unknown, status = 200, statusText = status === 200 ? "OK" : "Error") {
  return new Response(JSON.stringify(data), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

// The required fields of every detail schema; each schema drops the ones it does not declare.
const MINIMAL_DETAIL = { document_id: 1, locales: [], activities: [], waypoint_type: "summit", area_type: "range" };

describe("searchRoutes", () => {
  it("calls the correct URL and returns parsed response", async () => {
    const mockData = {
      documents: [
        {
          document_id: 123,
          locales: [{ lang: "fr", title: "Voie normale Mont Blanc" }],
          activities: ["skitouring"],
          elevation_max: 4808,
          global_rating: "F",
        },
      ],
      total: 1,
    };

    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await searchRoutes({ query: "Mont Blanc" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/routes");
    expect(url).toContain("q=Mont+Blanc");
    expect(url).toContain("pl=fr");

    expect(result.total).toBe(1);
    expect(wellFormed(result.documents)[0].document_id).toBe(123);
    expect(wellFormed(result.documents)[0].locales[0].title).toBe("Voie normale Mont Blanc");
  });

  it("puts a custom limit in the URL", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchRoutes({ query: "test", limit: 5 });

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/routes?q=test&limit=5&pl=fr`);
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

    await expect(searchRoutes({ query: "test" })).rejects.toThrow("Camptocamp API error: 500");
  });

  it("keeps the elevation gain and every rating through the response schema", async () => {
    // Route 55195 of the live GET /routes?q=voie normale&limit=10&pl=fr response (2026-10-04): summary, areas
    // and geometry left out.
    const rocciaNera = {
      document_id: 55195,
      version: 6,
      locales: [{ version: 10, lang: "fr", title: "Versant SW", title_prefix: "Roccia Nera" }],
      quality: "medium",
      activities: ["skitouring", "snow_ice_mixed"],
      elevation_min: 3425,
      elevation_max: 4075,
      height_diff_up: 650,
      height_diff_down: null,
      durations: ["1"],
      calculated_duration: 0.108333333333333,
      height_diff_difficulties: 650,
      orientations: ["SW"],
      ski_rating: "4.1",
      ski_exposition: "E4",
      labande_ski_rating: null,
      labande_global_rating: null,
      global_rating: "F",
      engagement_rating: "II",
      risk_rating: null,
      equipment_rating: null,
      ice_rating: null,
      mixed_rating: null,
      public_transportation_rating: "good service",
      available_langs: ["it", "eu", "fr"],
      protected: false,
      type: "r",
    };
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [rocciaNera], total: 1213 }));

    const result = await searchRoutes({ query: "voie normale" });

    expect(wellFormed(result.documents)[0]).toEqual({
      document_id: 55195,
      locales: [{ lang: "fr", title: "Versant SW", title_prefix: "Roccia Nera" }],
      activities: ["skitouring", "snow_ice_mixed"],
      elevation_max: 4075,
      height_diff_up: 650,
      height_diff_difficulties: 650,
      ski_rating: "4.1",
      ski_exposition: "E4",
      labande_ski_rating: null,
      labande_global_rating: null,
      global_rating: "F",
      engagement_rating: "II",
      risk_rating: null,
      equipment_rating: null,
      ice_rating: null,
      mixed_rating: null,
    });
  });
});

describe("getRoute", () => {
  it("fetches route by ID", async () => {
    const mockData = {
      document_id: 456,
      locales: [{ lang: "fr", title: "Arête des Cosmiques", description: "Belle arête." }],
      activities: ["rock_climbing"],
      elevation_max: 3842,
      global_rating: "TD",
      rock_free_rating: "5c",
    };

    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await getRoute(456);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/routes/456");

    expect(result.document_id).toBe(456);
    expect(result.global_rating).toBe("TD");
  });

  it("keeps the route's title_prefix through the response schema", async () => {
    // Trimmed from the live GET /routes/54085 response (2026-10-04): the fr locale only, its texts cut
    // to their first line; ratings, orientations, associations, maps and areas left out.
    const mockData = {
      document_id: 54085,
      version: 6,
      locales: [
        {
          version: 29,
          lang: "fr",
          title: "Versant W par le Glacier du Geay",
          summary: "Le Mont Pourri est le second sommet de la Vanoise et comporte un système glaciaire important.",
          description: "[img=192710 right]Mont Pourri, itinéraire 1[/img]",
          title_prefix: "Mont Pourri",
          topic_id: null,
        },
      ],
      quality: "medium",
      main_waypoint_id: 37916,
      activities: ["skitouring"],
      elevation_min: 2370,
      elevation_max: 3779,
      height_diff_up: 1425,
      height_diff_down: null,
      durations: ["1"],
      protected: false,
      type: "r",
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = routeDetailSchema.parse(await getRoute(54085));

    expect(result.locales[0].title_prefix).toBe("Mont Pourri");
    expect(result.locales[0].title).toBe("Versant W par le Glacier du Geay");
  });

  it("keeps the route's ratings through the response schema", async () => {
    // Trimmed from the live GET /routes/54085 response (2026-10-04): the ratings, the untyped
    // public_transportation_rating and the required fields only, the fr locale without texts.
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        document_id: 54085,
        locales: [{ lang: "fr", title: "Versant W par le Glacier du Geay", title_prefix: "Mont Pourri" }],
        activities: ["skitouring"],
        ski_rating: "4.1",
        ski_exposition: "E2",
        labande_ski_rating: "S4",
        labande_global_rating: "AD",
        public_transportation_rating: "good service",
      }),
    );

    const result = await getRoute(54085);

    expect(result).toEqual({
      document_id: 54085,
      locales: [{ lang: "fr", title: "Versant W par le Glacier du Geay", title_prefix: "Mont Pourri" }],
      activities: ["skitouring"],
      ski_rating: "4.1",
      ski_exposition: "E2",
      labande_ski_rating: "S4",
      labande_global_rating: "AD",
    });
  });

  it("keeps the route's associations and main waypoint through the response schema", async () => {
    // Trimmed from the live GET /routes/54085 response (2026-10-04): one document per association list, without
    // geometry and areas; GET /routes/944120 supplied the article, as 54085 has none.
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        document_id: 54085,
        locales: [{ lang: "fr", title: "Versant W par le Glacier du Geay", title_prefix: "Mont Pourri" }],
        activities: ["skitouring"],
        main_waypoint_id: 37916,
        associations: {
          waypoints: [
            {
              document_id: 37916,
              version: 6,
              locales: [{ version: 36, lang: "fr", title: "Mont Pourri", summary: "Le Mont Pourri…" }],
              quality: "great",
              waypoint_type: "summit",
              elevation: 3779,
              type: "w",
            },
          ],
          routes: [
            {
              document_id: 55834,
              locales: [{ lang: "fr", title: "Versant W - Glacier du Geay → Grand Col", title_prefix: "Mont Pourri" }],
              activities: ["snow_ice_mixed"],
              global_rating: "PD",
              risk_rating: null,
              type: "r",
            },
          ],
          books: [
            {
              document_id: 472409,
              version: 2,
              locales: [{ version: 1, lang: "fr", title: "Montagnes Magazine #396", summary: null }],
              quality: "medium",
              author: null,
              activities: ["skitouring", "ice_climbing"],
              book_types: ["magazine"],
              type: "b",
            },
          ],
          articles: [
            {
              document_id: 947724,
              locales: [{ lang: "fr", title: "Les voies 9b et au-delà", summary: null }],
              article_type: "collab",
              type: "c",
            },
          ],
          images: [{ document_id: 192710 }],
          xreports: [],
          recent_outings: {
            total: 64,
            documents: [
              {
                document_id: 1900552,
                locales: [{ version: 1, lang: "fr", title: "Mont Pourri : Versant W par le Glacier du Geay" }],
                activities: ["skitouring"],
                condition_rating: "good",
                date_end: "2026-04-26",
                date_start: "2026-04-26",
                public_transport: false,
                ski_rating: "4.1",
                areas: [{ document_id: 14409, locales: [{ lang: "fr", title: "Vanoise" }], area_type: "range" }],
                author: { name: "krok", user_id: 1573563 },
                type: "o",
              },
            ],
          },
        },
      }),
    );

    const result = await getRoute(54085);

    expect(result.main_waypoint_id).toBe(37916);
    expect(result.associations).toEqual({
      waypoints: [
        {
          document_id: 37916,
          locales: [{ lang: "fr", title: "Mont Pourri" }],
          waypoint_type: "summit",
          elevation: 3779,
        },
      ],
      routes: [
        {
          document_id: 55834,
          locales: [{ lang: "fr", title: "Versant W - Glacier du Geay → Grand Col", title_prefix: "Mont Pourri" }],
          global_rating: "PD",
          risk_rating: null,
        },
      ],
      books: [
        {
          document_id: 472409,
          locales: [{ lang: "fr", title: "Montagnes Magazine #396", summary: null }],
          quality: "medium",
          author: null,
          activities: ["skitouring", "ice_climbing"],
          book_types: ["magazine"],
        },
      ],
      articles: [{ document_id: 947724, locales: [{ lang: "fr", title: "Les voies 9b et au-delà" }] }],
      recent_outings: {
        total: 64,
        documents: [
          {
            document_id: 1900552,
            locales: [{ lang: "fr", title: "Mont Pourri : Versant W par le Glacier du Geay" }],
            activities: ["skitouring"],
            condition_rating: "good",
            date_end: "2026-04-26",
            date_start: "2026-04-26",
            ski_rating: "4.1",
            areas: [{ document_id: 14409, locales: [{ lang: "fr", title: "Vanoise" }], area_type: "range" }],
            author: { name: "krok", user_id: 1573563 },
          },
        ],
      },
    });
  });

  it("keeps the route's practical facts and free-text fields through the response schema", async () => {
    // Trimmed from the live GET /routes/54085 response (2026-10-04): the practical facts as sent, height_diff_access
    // null, the untyped calculated_duration and route_length; the fr locale with its texts cut to their first words.
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        document_id: 54085,
        locales: [
          {
            version: 29,
            lang: "fr",
            title: "Versant W par le Glacier du Geay",
            summary: "Le Mont Pourri est le second sommet de la Vanoise",
            slope: "40°",
            route_history: "- Premier parcours de la partie du [[routes/54080/fr|Col des Roches]] au sommet",
            external_resources: "- *Mont Pourri or Mont Thuriaz* par W. A. B. Coolidge",
            title_prefix: "Mont Pourri",
            topic_id: null,
          },
        ],
        activities: ["skitouring"],
        route_length: null,
        durations: ["1"],
        calculated_duration: 0.2375,
        height_diff_access: null,
        height_diff_difficulties: 900,
        route_types: ["return_same_way"],
        orientations: ["NW"],
        glacier_gear: "glacier_safety_gear",
        configuration: ["glacier"],
        lift_access: true,
      }),
    );

    const result = await getRoute(54085);

    expect(result).toEqual({
      document_id: 54085,
      locales: [
        {
          lang: "fr",
          title: "Versant W par le Glacier du Geay",
          summary: "Le Mont Pourri est le second sommet de la Vanoise",
          slope: "40°",
          route_history: "- Premier parcours de la partie du [[routes/54080/fr|Col des Roches]] au sommet",
          external_resources: "- *Mont Pourri or Mont Thuriaz* par W. A. B. Coolidge",
          title_prefix: "Mont Pourri",
        },
      ],
      activities: ["skitouring"],
      durations: ["1"],
      height_diff_access: null,
      height_diff_difficulties: 900,
      route_types: ["return_same_way"],
      orientations: ["NW"],
      glacier_gear: "glacier_safety_gear",
      configuration: ["glacier"],
      lift_access: true,
    });
  });

  it("keeps lift_access false through the response schema", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        document_id: 54085,
        locales: [{ lang: "fr", title: "Versant W par le Glacier du Geay" }],
        activities: ["skitouring"],
        height_diff_access: 300,
        lift_access: false,
      }),
    );

    const result = await getRoute(54085);

    expect(result.lift_access).toBe(false);
    expect(result.height_diff_access).toBe(300);
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 404));

    await expect(getRoute(999)).rejects.toThrow("Camptocamp API error: 404");
  });
});

describe("searchWaypoints", () => {
  it("calls the correct URL and returns parsed response", async () => {
    const mockData = {
      documents: [
        {
          document_id: 789,
          locales: [{ lang: "fr", title: "Mont Blanc" }],
          waypoint_type: "summit",
          elevation: 4808,
        },
      ],
      total: 1,
    };

    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await searchWaypoints({ query: "Mont Blanc" });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/waypoints");
    expect(url).toContain("q=Mont+Blanc");

    expect(result.total).toBe(1);
    expect(wellFormed(result.documents)[0].elevation).toBe(4808);
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 503));

    await expect(searchWaypoints({ query: "test" })).rejects.toThrow("Camptocamp API error: 503");
  });
});

// AC9.1: the four keyword searches page with `offset`, sent only when given.
describe("offset on searchWaypoints, searchAreas, searchBooks and searchArticles", () => {
  const searches: Array<[string, (offset?: number) => Promise<unknown>, string]> = [
    ["searchWaypoints", (offset) => searchWaypoints({ query: "pourri", limit: 2, offset }), "/waypoints"],
    ["searchAreas", (offset) => searchAreas({ query: "valais", limit: 2, offset }), "/areas"],
    ["searchBooks", (offset) => searchBooks({ query: "mont blanc", limit: 2, offset }), "/books"],
    ["searchArticles", (offset) => searchArticles({ query: "crampons", limit: 2, offset }), "/articles"],
  ];

  it.each(searches)("%s sends offset", async (_name, call, path) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await call(2);

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.pathname).toBe(path);
    expect(url.searchParams.get("offset")).toBe("2");
    expect(url.searchParams.get("limit")).toBe("2");
  });

  it.each(searches)("%s sends no offset when none is given", async (_name, call) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await call();

    expect(new URL(mockFetch.mock.calls[0][0] as string).searchParams.has("offset")).toBe(false);
  });

  it("searchWaypoints sends offset 0", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchWaypoints({ area_id: 14403, offset: 0 });

    expect(new URL(mockFetch.mock.calls[0][0] as string).searchParams.get("offset")).toBe("0");
  });
});

// AC9.2, AC9.3: type and activity filters, sent only when given.
describe("type filters on searchWaypoints and searchBooks", () => {
  function sentParams(): Record<string, string> {
    return Object.fromEntries(new URL(mockFetch.mock.calls[0][0] as string).searchParams);
  }

  it("searchWaypoints sends waypoint_type as wtyp", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchWaypoints({ query: "pourri", waypoint_type: "hut" });

    expect(sentParams()).toEqual({ q: "pourri", limit: "10", pl: "fr", wtyp: "hut" });
  });

  it("searchBooks sends book_type as btyp and activity as act", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchBooks({ query: "vanoise", book_type: "topo", activity: "skitouring" });

    expect(sentParams()).toEqual({ q: "vanoise", limit: "10", pl: "fr", btyp: "topo", act: "skitouring" });
  });

  it("searchBooks sends act without btyp", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchBooks({ query: "vanoise", activity: "hiking" });

    expect(sentParams()).toEqual({ q: "vanoise", limit: "10", pl: "fr", act: "hiking" });
  });

  it("sends neither wtyp, btyp nor act when not given", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(makeResponse({ documents: [], total: 0 })));

    await searchWaypoints({ query: "pourri" });
    await searchBooks({ query: "vanoise" });

    for (const [url] of mockFetch.mock.calls) {
      const params = new URL(url as string).searchParams;
      for (const name of ["wtyp", "btyp", "act"]) expect(params.has(name)).toBe(false);
    }
  });
});

describe("getWaypoint", () => {
  it("fetches waypoint by ID", async () => {
    const mockData = {
      document_id: 321,
      locales: [{ lang: "fr", title: "Refuge du Goûter", description: "Refuge gardé." }],
      waypoint_type: "hut",
      elevation: 3835,
      geometry: { geom: '{"type": "Point", "coordinates": [761655.0, 5751022.0]}' },
    };

    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await getWaypoint(321);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/waypoints/321");

    expect(result.document_id).toBe(321);
    expect(result.elevation).toBe(3835);
    expect(result.geometry?.geom).toContain("Point");
  });

  it("keeps the hut fields, the summary and the access period", async () => {
    // Trimmed from the live GET /waypoints/273946?lang=fr response (2026-10-04): description and access cut
    // to 80 characters, areas, associations, maps and maps_info dropped; the summary set to show it survives.
    const mockData = {
      document_id: 273946,
      version: 4,
      locales: [
        {
          version: 7,
          lang: "fr",
          title: "Refuge du Lac Blanc",
          description: "Le Refuge du Lac Blanc est niché sur le plateau de Praz Bouchet, entouré de plus",
          summary: "Refuge gardé en été.",
          access: "Depuis Termignon la Vanoise, prendre la route de Bellecombe (D126) ou la navette",
          access_period: "De début juin à fin septembre",
          external_resources: null,
          topic_id: 212047,
        },
      ],
      geometry: { version: 3, geom: '{"type": "Point", "coordinates": [758908.605978137, 5671856.762174786]}' },
      quality: "fine",
      waypoint_type: "hut",
      elevation: 2300,
      capacity: 0,
      capacity_staffed: 18,
      url: "https://www.refugedulacblanc-vanoise.com",
      phone: "+33 (0)6 82 38 11 98",
      phone_custodian: "+33 (0)6 45 98 77 26",
      custodianship: "accessible_when_wardened",
      matress_unstaffed: false,
      blanket_unstaffed: false,
      gas_unstaffed: false,
      heating_unstaffed: false,
      available_langs: ["fr"],
      protected: false,
      type: "w",
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await getWaypoint(273946);

    expect(result.capacity).toBe(0);
    expect(result.capacity_staffed).toBe(18);
    expect(result.custodianship).toBe("accessible_when_wardened");
    expect(result.phone).toBe("+33 (0)6 82 38 11 98");
    expect(result.phone_custodian).toBe("+33 (0)6 45 98 77 26");
    expect(result.url).toBe("https://www.refugedulacblanc-vanoise.com");
    expect(result.locales[0].summary).toBe("Refuge gardé en été.");
    expect(result.locales[0].access_period).toBe("De début juin à fin septembre");
  });

  it("accepts null hut fields, as a summit or a bivouac sends them", async () => {
    // Trimmed from the live GET /waypoints/1810808?lang=fr response (2026-10-04): a bivouac with every hut
    // field null.
    const mockData = {
      document_id: 1810808,
      locales: [{ lang: "fr", title: "Bivouac du col de la Temple", summary: null, access_period: null }],
      waypoint_type: "bivouac",
      elevation: 3321,
      capacity: null,
      capacity_staffed: null,
      custodianship: null,
      phone: null,
      phone_custodian: null,
      url: null,
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await getWaypoint(1810808);

    expect(result.capacity).toBeNull();
    expect(result.custodianship).toBeNull();
    expect(result.locales[0].access_period).toBeNull();
  });

  it("keeps all_routes, books and recent_outings through the response schema", async () => {
    // Trimmed from the live GET /waypoints/37355?lang=fr response (2026-10-04): one item per list, without
    // geometry, areas and texts; the other associations as the API sends them (no routes key), with
    // waypoint_children, images and articles emptied.
    const mockData = {
      document_id: 37355,
      locales: [{ lang: "fr", title: "Mont Blanc" }],
      waypoint_type: "summit",
      elevation: 4805,
      associations: {
        waypoints: [],
        waypoint_children: [],
        articles: [],
        images: [],
        xreports: [],
        all_routes: {
          total: 39,
          documents: [
            {
              document_id: 1893205,
              version: 1,
              locales: [
                { version: 2, lang: "fr", title: "Himalamiage ", summary: null, title_prefix: "Pointe Louis Amédée" },
              ],
              quality: "medium",
              activities: ["snow_ice_mixed", "mountain_climbing"],
              elevation_min: null,
              elevation_max: 4806,
              height_diff_up: 1600,
              durations: [],
              height_diff_difficulties: 800,
              orientations: ["E"],
              global_rating: "ED-",
              engagement_rating: "IV",
              risk_rating: null,
              ice_rating: "4+",
              mixed_rating: "M4+",
              rock_required_rating: "5c",
              aid_rating: "A1",
              public_transportation_rating: "unknown service",
              available_langs: ["fr"],
              protected: false,
              type: "r",
            },
          ],
        },
        books: [
          {
            document_id: 176597,
            version: 2,
            locales: [{ version: 3, lang: "fr", title: "Mont Blanc 4808 m - 5 Voies Pour Le Sommet", summary: null }],
            quality: "medium",
            author: "François Damilano",
            activities: ["snow_ice_mixed"],
            book_types: ["topo"],
            available_langs: ["fr"],
            protected: false,
            type: "b",
          },
        ],
        recent_outings: {
          total: 1743,
          documents: [
            {
              document_id: 1955437,
              version: 1,
              locales: [{ version: 1, lang: "fr", title: "Mont Blanc : Arête des Bosses", summary: null }],
              quality: "fine",
              activities: ["snow_ice_mixed"],
              condition_rating: "excellent",
              date_end: "2026-09-28",
              date_start: "2026-09-28",
              elevation_max: 4810,
              height_diff_up: 1000,
              public_transport: false,
              global_rating: "PD-",
              engagement_rating: "III",
              areas: [{ document_id: 14410, locales: [{ lang: "fr", title: "Mont-Blanc" }], area_type: "range" }],
              author: { name: "Nicolas 38500", user_id: 1677883 },
              type: "o",
              img_count: 0,
            },
          ],
        },
      },
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await getWaypoint(37355);

    expect(result.associations).toEqual({
      all_routes: {
        total: 39,
        documents: [
          {
            document_id: 1893205,
            locales: [{ lang: "fr", title: "Himalamiage ", title_prefix: "Pointe Louis Amédée" }],
            activities: ["snow_ice_mixed", "mountain_climbing"],
            elevation_max: 4806,
            height_diff_up: 1600,
            height_diff_difficulties: 800,
            global_rating: "ED-",
            engagement_rating: "IV",
            risk_rating: null,
            ice_rating: "4+",
            mixed_rating: "M4+",
            rock_required_rating: "5c",
            aid_rating: "A1",
          },
        ],
      },
      books: [
        {
          document_id: 176597,
          locales: [{ lang: "fr", title: "Mont Blanc 4808 m - 5 Voies Pour Le Sommet", summary: null }],
          quality: "medium",
          author: "François Damilano",
          activities: ["snow_ice_mixed"],
          book_types: ["topo"],
          available_langs: ["fr"],
        },
      ],
      recent_outings: {
        total: 1743,
        documents: [
          {
            document_id: 1955437,
            locales: [{ lang: "fr", title: "Mont Blanc : Arête des Bosses" }],
            activities: ["snow_ice_mixed"],
            condition_rating: "excellent",
            date_end: "2026-09-28",
            date_start: "2026-09-28",
            elevation_max: 4810,
            height_diff_up: 1000,
            global_rating: "PD-",
            engagement_rating: "III",
            areas: [{ document_id: 14410, locales: [{ lang: "fr", title: "Mont-Blanc" }], area_type: "range" }],
            author: { name: "Nicolas 38500", user_id: 1677883 },
          },
        ],
      },
    });
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 404));

    await expect(getWaypoint(999)).rejects.toThrow("Camptocamp API error: 404");
  });
});

describe("getOuting", () => {
  it("fetches outing by ID", async () => {
    const mockData = {
      document_id: 1915495,
      locales: [
        {
          lang: "fr",
          title: "Valle dell'Orco - Sergent : Nautilus",
          description: "Belle sortie.",
          weather: "Beau",
        },
      ],
      activities: ["rock_climbing"],
      date_start: "2026-06-14",
      global_rating: "TD",
      author: { name: "o.laurendeau", user_id: 430052 },
    };

    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await getOuting(1915495);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/outings/1915495");

    expect(result.document_id).toBe(1915495);
    expect(result.global_rating).toBe("TD");
    expect(result.locales[0].weather).toBe("Beau");
  });

  it("keeps an associated route's title_prefix through the response schema", async () => {
    // Trimmed from the live GET /outings/1880674 response (2026-10-04): locale texts cut, other texts, snow and hut
    // fields, geometry, areas and the users, images, articles and xreports associations left out; the
    // route association keeps its fr and en locales and drops geometry and areas.
    const mockData = {
      document_id: 1880674,
      version: 2,
      locales: [
        {
          version: 3,
          lang: "fr",
          title: "Mont Pourri : Versant W par le Glacier du Geay",
          description: "Super sortie sauvage sans passer par la station des Arcs !",
          summary: null,
          weather: "Grand beau, sans vent",
          topic_id: null,
        },
      ],
      quality: "fine",
      activities: ["skitouring"],
      condition_rating: "good",
      date_end: "2026-03-08",
      date_start: "2026-03-07",
      elevation_max: 3779,
      elevation_min: 2370,
      height_diff_down: null,
      height_diff_up: 1600,
      participant_count: 2,
      ski_rating: "4.1",
      labande_global_rating: "AD",
      associations: {
        routes: [
          {
            document_id: 54085,
            version: 6,
            locales: [
              {
                version: 29,
                lang: "fr",
                title: "Versant W par le Glacier du Geay",
                summary:
                  "Le Mont Pourri est le second sommet de la Vanoise et comporte un système glaciaire important.",
                title_prefix: "Mont Pourri",
              },
              {
                version: 2,
                lang: "en",
                title: "Normal route from Glacier du Geay",
                summary: null,
                title_prefix: "Mont Pourri",
              },
            ],
            quality: "medium",
            activities: ["skitouring"],
            elevation_min: 2370,
            elevation_max: 3779,
            ski_rating: "4.1",
            available_langs: ["fr", "de", "en", "it"],
            protected: false,
            type: "r",
          },
        ],
      },
      protected: false,
      type: "o",
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = outingDetailSchema.parse(await getOuting(1880674));

    const route = wellFormed(result.associations?.routes)[0];
    expect(route.document_id).toBe(54085);
    expect(route.locales[0].title_prefix).toBe("Mont Pourri");
    expect(route.locales[1].title_prefix).toBe("Mont Pourri");
  });

  it("keeps the outing's and its associated route's ratings through the response schema", async () => {
    // Trimmed from the live GET /outings/1880674 response (2026-10-04): every field but the ratings and the
    // untyped public_transportation_rating left out, the route association keeping its fr locale.
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        document_id: 1880674,
        locales: [{ lang: "fr", title: "Mont Pourri : Versant W par le Glacier du Geay" }],
        activities: ["skitouring"],
        ski_rating: "4.1",
        labande_global_rating: "AD",
        associations: {
          routes: [
            {
              document_id: 54085,
              locales: [{ lang: "fr", title: "Versant W par le Glacier du Geay", title_prefix: "Mont Pourri" }],
              ski_rating: "4.1",
              ski_exposition: "E2",
              labande_ski_rating: "S4",
              labande_global_rating: "AD",
              public_transportation_rating: "good service",
            },
          ],
        },
      }),
    );

    const result = await getOuting(1880674);

    expect(result).toMatchObject({ ski_rating: "4.1", labande_global_rating: "AD" });
    const route = wellFormed(result.associations?.routes)[0];
    expect(route).toEqual({
      document_id: 54085,
      locales: [{ lang: "fr", title: "Versant W par le Glacier du Geay", title_prefix: "Mont Pourri" }],
      ski_rating: "4.1",
      ski_exposition: "E2",
      labande_ski_rating: "S4",
      labande_global_rating: "AD",
    });
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 404));

    await expect(getOuting(999)).rejects.toThrow("Camptocamp API error: 404");
  });
});

const API = "https://api.camptocamp.org";

// Real area items as embedded in GET /routes/54275 (2026-10-03): fr is not the first locale.
const AREA_FRANCE = {
  document_id: 14274,
  version: 12,
  locales: [
    { version: 1, lang: "zh", title: "法国" },
    { version: 1, lang: "sl", title: "Francija" },
    { version: 6, lang: "fr", title: "France" },
    { version: 3, lang: "ca", title: "França" },
    { version: 1, lang: "de", title: "Frankreich" },
    { version: 1, lang: "en", title: "France" },
    { version: 1, lang: "es", title: "Francia" },
    { version: 2, lang: "eu", title: "France" },
    { version: 1, lang: "it", title: "Francia" },
  ],
  area_type: "country",
  available_langs: null,
  protected: false,
  type: "a",
};

const AREA_HAUTES_ALPES = {
  document_id: 14361,
  version: 4,
  locales: [
    { version: 1, lang: "zh", title: "上阿尔卑斯省" },
    { version: 1, lang: "ca", title: "Alts Alps" },
    { version: 1, lang: "de", title: "Hautes-Alpes" },
    { version: 1, lang: "en", title: "Hautes-Alpes" },
    { version: 1, lang: "es", title: "Altos Alpes" },
    { version: 1, lang: "eu", title: "Alpe Garaiak" },
    { version: 6, lang: "fr", title: "Hautes-Alpes" },
    { version: 1, lang: "it", title: "Alte Alpi" },
  ],
  area_type: "admin_limits",
  available_langs: null,
  protected: false,
  type: "a",
};

const AREA_ECRINS = {
  document_id: 14403,
  version: 21,
  locales: [{ version: 45, lang: "fr", title: "Écrins" }],
  area_type: "range",
  available_langs: ["fr"],
  protected: false,
  type: "a",
};

// Real item from GET /areas?q=valais&atyp=range (2026-10-03): sl comes first, fr is fourth.
const AREA_VALAIS_E = {
  document_id: 14436,
  version: 7,
  locales: [
    { version: 4, lang: "sl", title: " Peninske Alpe vzhod" },
    { version: 1, lang: "de", title: "Walliser Alpen E - Penninische Alpen E" },
    { version: 1, lang: "en", title: "Valais E - Pennine Alps E" },
    { version: 5, lang: "fr", title: "Valais E - Alpes Pennines E" },
    { version: 3, lang: "it", title: "Alpi Pennine Orientali" },
  ],
  area_type: "range",
  available_langs: ["sl", "de", "en", "fr", "it"],
  protected: false,
  type: "a",
};

describe("searchAreas", () => {
  it("calls the exact areas URL and returns the parsed response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [AREA_ECRINS], total: 1 }));

    const result = await searchAreas({ query: "ecrins" });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/areas?q=ecrins&limit=10&pl=fr`);
    expect(result.total).toBe(1);
    expect(wellFormed(result.documents)[0].area_type).toBe("range");
    expect(wellFormed(result.documents)[0].locales[0].title).toBe("Écrins");
  });

  it("adds atyp only when an area type is given, keeping the real locale order", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [AREA_VALAIS_E], total: 2 }));

    const result = await searchAreas({ query: "valais", area_type: "range" });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe(`${API}/areas?q=valais&limit=10&pl=fr&atyp=range`);
    expect(url.endsWith("&atyp=range")).toBe(true);
    expect(result.total).toBe(2);
    expect(wellFormed(result.documents)[0].locales[0].lang).toBe("sl");
    expect(wellFormed(result.documents)[0].locales[3]).toMatchObject({
      lang: "fr",
      title: "Valais E - Alpes Pennines E",
    });
  });

  it("throws on a 500 response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

    await expect(searchAreas({ query: "ecrins" })).rejects.toThrow("Camptocamp API error: 500 Error");
  });
});

describe("getArea", () => {
  it("calls the exact area URL and keeps summary and description", async () => {
    // Trimmed from the real GET /areas/14403?lang=fr response (2026-10-03).
    const summary =
      "Le massif des Écrins est un grand massif montagneux des Alpes françaises situé dans les Hautes-Alpes et en Isère. Il abrite d'importants glaciers, tant en nombre qu'en taille.";
    const mockData = {
      document_id: 14403,
      version: 21,
      area_type: "range",
      quality: "medium",
      locales: [
        {
          version: 45,
          lang: "fr",
          title: "Écrins",
          summary,
          description:
            "[img=254125 big no_legend no_border center]Le massif des Écrins depuis la Maurienne[/img]\n[toc]",
        },
      ],
      geometry: {
        version: 3,
        geom: null,
        geom_detail:
          '{"type": "Polygon", "coordinates": [[[645731.6614793761, 5602179.434310868], [645731.6614793761, 5602179.434310868]]]}',
      },
      associations: { images: [] },
      available_langs: ["fr"],
      protected: false,
      type: "a",
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await getArea(14403);

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/areas/14403`);
    expect(result.document_id).toBe(14403);
    expect(result.area_type).toBe("range");
    expect(result.locales[0].summary).toBe(summary);
    expect(result.locales[0].description).toContain("[toc]");
    expect(result.geometry?.geom).toBeNull();
  });

  it("throws on a 404 response", async () => {
    // Status and body of the live GET /areas/999999999 response; every missing ID answers the same.
    mockFetch.mockResolvedValueOnce(
      makeResponse(
        { status: "error", errors: [{ location: "body", name: "Not Found", description: "document not found" }] },
        404,
        "Not Found",
      ),
    );

    await expect(getArea(999999999)).rejects.toThrow(
      new Error("Camptocamp API error: 404 Not Found (area 999999999): document not found"),
    );
  });
});

describe("area filter on searchRoutes and searchWaypoints", () => {
  const cases = [
    { name: "searchRoutes", fn: searchRoutes, path: "routes" },
    { name: "searchWaypoints", fn: searchWaypoints, path: "waypoints" },
  ] as const;

  for (const { name, fn, path } of cases) {
    describe(name, () => {
      it("keeps the URL unchanged without an area", async () => {
        mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

        await fn({ query: "Mont Blanc" });

        expect(mockFetch.mock.calls[0][0]).toBe(`${API}/${path}?q=Mont+Blanc&limit=10&pl=fr`);
      });

      it("appends a= after the existing parameters when an area is given", async () => {
        mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

        await fn({ query: "couloir", limit: 10, area_id: 14403 });

        expect(mockFetch.mock.calls[0][0]).toBe(`${API}/${path}?q=couloir&limit=10&pl=fr&a=14403`);
      });

      it("omits q= when no query is given", async () => {
        mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

        await fn({ limit: 10, area_id: 14403 });

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toBe(`${API}/${path}?limit=10&pl=fr&a=14403`);
        expect(url).not.toContain("q=");
      });

      it("omits q= when the query key is set to undefined, as the tool handlers send it", async () => {
        mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

        await fn({ query: undefined, limit: 10, area_id: 14403 });

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toBe(`${API}/${path}?limit=10&pl=fr&a=14403`);
        expect(url).not.toContain("q=");
      });
    });
  }
});

// S4: route filters. Rating params come from c2corg v6_api's route search mapping; each param was
// checked live against the field it filters (e.g. `srat=S5` returns routes with labande_ski_rating S5).
describe("searchRoutes filters", () => {
  function calledParams(call = 0): URLSearchParams {
    return new URL(mockFetch.mock.calls[call][0] as string).searchParams;
  }

  beforeEach(() => {
    mockFetch.mockImplementation(() => Promise.resolve(makeResponse({ documents: [], total: 0 })));
  });

  it("sends activity, rating and elevation gain filters together", async () => {
    await searchRoutes({
      area_id: 14403,
      activity: "skitouring",
      rating: { system: "ski_rating", min: "3.1", max: "4.1" },
      height_diff_up: { min: 1000, max: 1500 },
    });

    const params = calledParams();
    expect(params.get("a")).toBe("14403");
    expect(params.get("act")).toBe("skitouring");
    expect(params.get("trat")).toBe("3.1,4.1");
    expect(params.get("hdif")).toBe("1000,1500");
    expect(params.get("pl")).toBe("fr");
  });

  it("sends min alone for an open upper bound", async () => {
    await searchRoutes({ rating: { system: "global_rating", min: "AD" }, height_diff_up: { min: 1000 } });

    expect(calledParams().get("grat")).toBe("AD");
    expect(calledParams().get("hdif")).toBe("1000");
  });

  it("sends ,max for an open lower bound", async () => {
    await searchRoutes({ rating: { system: "global_rating", max: "PD" }, height_diff_up: { max: 1500 } });

    expect(calledParams().get("grat")).toBe(",PD");
    expect(calledParams().get("hdif")).toBe(",1500");
  });

  it("sends no range parameter when neither bound is given", async () => {
    await searchRoutes({ query: "gamma", rating: { system: "ski_rating" }, height_diff_up: {} });

    expect(calledParams().has("trat")).toBe(false);
    expect(calledParams().has("hdif")).toBe(false);
  });

  const ratingParams: Array<[RouteRatingField, string]> = [
    ["ski_rating", "trat"],
    ["global_rating", "grat"],
    ["labande_global_rating", "lrat"],
    ["labande_ski_rating", "srat"],
    ["ski_exposition", "sexpo"],
    ["engagement_rating", "erat"],
    ["risk_rating", "orrat"],
    ["equipment_rating", "prat"],
    ["ice_rating", "irat"],
    ["mixed_rating", "mrat"],
    ["exposition_rock_rating", "rexpo"],
    ["rock_free_rating", "frat"],
    ["rock_required_rating", "rrat"],
    ["aid_rating", "arat"],
    ["via_ferrata_rating", "krat"],
    ["hiking_rating", "hrat"],
    ["hiking_mtb_exposition", "hexpo"],
    ["snowshoe_rating", "wrat"],
    ["mtb_up_rating", "mbur"],
    ["mtb_down_rating", "mbdr"],
  ];

  it("covers the 20 rating systems, each with its own parameter", () => {
    expect([...ROUTE_RATING_FIELDS].sort()).toEqual(ratingParams.map(([field]) => field).sort());
    expect(new Set(Object.values(ROUTE_RATING_PARAMS)).size).toBe(20);
  });

  it.each(ratingParams)("maps %s to %s", async (system, param) => {
    expect(ROUTE_RATING_PARAMS[system]).toBe(param);

    await searchRoutes({ rating: { system, min: "X", max: "Y" } });

    expect(calledParams().get(param)).toBe("X,Y");
  });

  it("joins configurations and route types with commas", async () => {
    await searchRoutes({ configuration: ["edge", "face"], route_types: ["traverse"] });

    expect(calledParams().get("conf")).toBe("edge,face");
    expect(calledParams().get("rtyp")).toBe("traverse");
  });

  it("sends no conf or rtyp for empty lists", async () => {
    await searchRoutes({ query: "gamma", configuration: [], route_types: [] });

    expect(calledParams().has("conf")).toBe(false);
    expect(calledParams().has("rtyp")).toBe(false);
  });

  it("sends a waypoint with an activity", async () => {
    await searchRoutes({ waypoint_id: 37916, activity: "skitouring" });

    expect(calledParams().get("w")).toBe("37916");
    expect(calledParams().get("act")).toBe("skitouring");
    expect(calledParams().get("pl")).toBe("fr");
  });

  it("sends the offset when given, including 0", async () => {
    await searchRoutes({ area_id: 14403, offset: 20 });
    await searchRoutes({ area_id: 14403, offset: 0 });

    expect(calledParams(0).get("offset")).toBe("20");
    expect(calledParams(1).get("offset")).toBe("0");
  });

  it("keeps the URL unchanged when no new filter is given", async () => {
    await searchRoutes({ query: "gamma", area_id: 14403 });

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/routes?q=gamma&limit=10&pl=fr&a=14403`);
  });
});

describe("areas on route details", () => {
  it("returns the areas embedded in a route", async () => {
    // Trimmed from the real GET /routes/54275?lang=fr response (2026-10-03).
    const mockData = {
      document_id: 54275,
      version: 6,
      locales: [
        { lang: "es", title: "goulotte allera- Pelatan.", title_prefix: "Le Râteau - Sommet W" },
        {
          lang: "fr",
          title: "Grand couloir N - Goulotte Allera - Pelatan",
          title_prefix: "Le Râteau - Sommet W",
        },
      ],
      quality: "medium",
      main_waypoint_id: 39669,
      activities: ["mountain_climbing", "snow_ice_mixed"],
      elevation_min: 1417,
      elevation_max: 3769,
      height_diff_up: 2352,
      height_diff_down: null,
      global_rating: "TD",
      engagement_rating: "IV",
      equipment_rating: "P3",
      rock_free_rating: "4a",
      rock_required_rating: null,
      areas: [AREA_FRANCE, AREA_HAUTES_ALPES, AREA_ECRINS],
      type: "r",
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await getRoute(54275);

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/routes/54275`);
    expect(result.areas?.[0].document_id).toBe(14274);
    expect(wellFormed(result.areas).map((a) => a.area_type)).toEqual(["country", "admin_limits", "range"]);
    expect(wellFormed(result.areas)[1].locales[6]).toMatchObject({ lang: "fr", title: "Hautes-Alpes" });
  });
});

describe("searchOutings", () => {
  // Trimmed from the real GET /outings?r=53884&date=2026-06-01,2026-09-30&sort=-date_end
  // response (2026-10-03): a mountaineering outing has no ski_rating / labande_global_rating.
  const OUTING_COSMIQUES = {
    document_id: 1938453,
    version: 1,
    locales: [{ version: 1, lang: "fr", title: "Aiguille du Midi : Arête des Cosmiques", summary: null }],
    quality: "fine",
    activities: ["mountain_climbing", "snow_ice_mixed"],
    condition_rating: "average",
    date_end: "2026-08-10",
    date_start: "2026-08-10",
    elevation_max: 3842,
    height_diff_up: 300,
    public_transport: false,
    global_rating: "AD",
    height_diff_difficulties: 240,
    engagement_rating: "II",
    available_langs: ["fr"],
    areas: [
      {
        document_id: 14274,
        version: 12,
        locales: [{ version: 6, lang: "fr", title: "France" }],
        area_type: "country",
        available_langs: null,
        protected: false,
        type: "a",
      },
      {
        document_id: 14410,
        version: 19,
        locales: [
          { version: 7, lang: "sl", title: "Mont-Blanc" },
          { version: 44, lang: "fr", title: "Mont-Blanc" },
          { version: 3, lang: "it", title: "Monte Bianco" },
        ],
        area_type: "range",
        available_langs: null,
        protected: false,
        type: "a",
      },
      {
        document_id: 14366,
        version: 3,
        locales: [{ version: 3, lang: "fr", title: "Haute-Savoie" }],
        area_type: "admin_limits",
        available_langs: null,
        protected: false,
        type: "a",
      },
    ],
    author: { name: "Keagan B.", user_id: 1910408 },
    protected: false,
    type: "o",
    img_count: 6,
  };

  // Trimmed from the real GET /outings?act=skitouring&date=2026-01-01,2026-03-31 response
  // (2026-10-03): a ski touring outing has ski and Labande ratings but no global_rating.
  const OUTING_SKITOURING = {
    document_id: 1891688,
    version: 5,
    locales: [
      {
        version: 8,
        lang: "fr",
        title: "Une semaine de ski entre Saas Fe et Tash Hutte",
        summary: null,
      },
    ],
    quality: "fine",
    activities: ["skitouring"],
    condition_rating: "good",
    date_end: "2026-04-04",
    date_start: "2026-03-29",
    elevation_max: 4206,
    height_diff_up: 8615,
    public_transport: false,
    ski_rating: "3.1",
    labande_global_rating: "PD+",
    available_langs: ["fr"],
    areas: [{ document_id: 14436, locales: [{ lang: "fr", title: "Valais E" }], area_type: "range" }],
    author: { name: "agnes H", user_id: 1142226 },
    protected: false,
    type: "o",
    img_count: 52,
  };

  function calledUrl(): URL {
    return new URL(mockFetch.mock.calls[0][0] as string);
  }

  it("keeps every rating of a list item through the outing list schemas", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [OUTING_COSMIQUES, OUTING_SKITOURING], total: 2 }));
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [OUTING_COSMIQUES, OUTING_SKITOURING], total: 2 }));

    // search_outings and its search_user_outings alias read the same GET /outings list items.
    const list = await searchOutings({});
    const userList = await searchOutings({ user_id: 1910408 });

    for (const { documents } of [list, userList]) {
      expect(documents[0]).toMatchObject({ global_rating: "AD", engagement_rating: "II" });
      expect(documents[1]).toMatchObject({ ski_rating: "3.1", labande_global_rating: "PD+" });
    }
  });

  it("sends only sort, limit, offset and pl when no filter is given", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [OUTING_COSMIQUES, OUTING_SKITOURING], total: 14 }));

    const result = await searchOutings();

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/outings?sort=-date_end&limit=10&offset=0&pl=fr`);
    expect(result.total).toBe(14);
    expect(wellFormed(result.documents)[0].areas?.[1].area_type).toBe("range");
    expect(wellFormed(result.documents)[0].condition_rating).toBe("average");
    expect(wellFormed(result.documents)[0].ski_rating).toBeUndefined();
    expect(wellFormed(result.documents)[1].ski_rating).toBe("3.1");
    expect(wellFormed(result.documents)[1].labande_global_rating).toBe("PD+");
    expect(wellFormed(result.documents)[1].global_rating).toBeUndefined();
  });

  it("sends every filter in order, before the sort", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({
      query: "cosmiques",
      area_id: 14409,
      activity: "skitouring",
      route_id: 53884,
      waypoint_id: 37233,
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("?q=cosmiques&a=14409&act=skitouring&r=53884&w=37233&sort=-date_end");
    expect(calledUrl().searchParams.has("date")).toBe(false);
  });

  // Plain -date_end leaves outings ending the same day in arbitrary order between pages; -id makes it strict.
  it("breaks date ties by descending ID with tiebreak_by_id", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ route_id: 54513, tiebreak_by_id: true, limit: 100 });

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/outings?r=54513&sort=-date_end%2C-id&limit=100&offset=0&pl=fr`);
  });

  it.each([false, undefined])("keeps the -date_end sort with tiebreak_by_id %s", async (tiebreak) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ route_id: 54513, tiebreak_by_id: tiebreak });

    expect(calledUrl().searchParams.get("sort")).toBe("-date_end");
    expect(calledUrl().searchParams.has("tiebreak_by_id")).toBe(false);
  });

  it("sends custom limit and offset and no unset filter", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ limit: 25, offset: 50 });

    const params = calledUrl().searchParams;
    expect(params.get("limit")).toBe("25");
    expect(params.get("offset")).toBe("50");
    for (const name of ["q", "a", "act", "date", "period", "r", "w", "u"]) {
      expect(params.has(name)).toBe(false);
    }
  });

  it("does not send q for an empty query", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ query: "" });

    expect(calledUrl().searchParams.has("q")).toBe(false);
  });

  it("sends a closed date range", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ date_from: "2026-01-01", date_to: "2026-03-31" });

    expect(calledUrl().searchParams.get("date")).toBe("2026-01-01,2026-03-31");
  });

  it("sends an open-ended upper bound with date_from only", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ date_from: "2026-09-01" });

    const date = calledUrl().searchParams.get("date");
    expect(date).toBe("2026-09-01,9999-12-31");
    expect(date?.split(",")[1]).not.toBe("2026-09-01");
  });

  it("sends an open-ended lower bound with date_to only", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ date_to: "2026-01-01" });

    expect(calledUrl().searchParams.get("date")).toBe("0001-01-01,2026-01-01");
  });

  // AC5.1: Camptocamp matches `period` on month and day in every year; 2020 is a leap year, so 02-29 is valid.
  it("sends a period as a 2020 date range", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ waypoint_id: 37916, period: { start: "06-01", end: "06-30" } });

    const params = calledUrl().searchParams;
    expect(params.get("period")).toBe("2020-06-01,2020-06-30");
    expect(params.get("w")).toBe("37916");
    expect(params.has("date")).toBe(false);
  });

  it("sends 02-29 as the leap day of 2020", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ period: { start: "02-01", end: "02-29" } });

    expect(calledUrl().searchParams.get("period")).toBe("2020-02-01,2020-02-29");
  });

  // #251: the API reduces each bound to its time modulo a 365.2425-day year, so 2020-01-01 lands at day 365.1,
  // after every other day. A 01-01 start goes in 1970 (day 0), a 01-01 end in 2021 (day 0.6, before every 01-02).
  it.each([
    ["01-01", "01-31", "1970-01-01,2020-01-31"],
    ["01-01", "01-01", "1970-01-01,2021-01-01"],
    ["01-01", "02-29", "1970-01-01,2020-02-29"],
    ["01-01", "12-31", "1970-01-01,2020-12-31"],
    ["02-29", "02-29", "2020-02-29,2020-02-29"],
    ["06-01", "06-30", "2020-06-01,2020-06-30"],
    ["12-20", "12-31", "2020-12-20,2020-12-31"],
  ])("sends the period %s → %s as %s", async (start, end, expected) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ period: { start, end } });

    expect(calledUrl().searchParams.get("period")).toBe(expected);
  });

  // AC5.3: the period and the date range are two independent filters.
  it("sends both period and date when both are given", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({
      waypoint_id: 37916,
      period: { start: "06-01", end: "06-30" },
      date_from: "2015-01-01",
      date_to: "2020-12-31",
    });

    const params = calledUrl().searchParams;
    expect(params.get("period")).toBe("2020-06-01,2020-06-30");
    expect(params.get("date")).toBe("2015-01-01,2020-12-31");
  });

  // AC5.5
  it("sends user_id as u", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ user_id: 430052, activity: "rock_climbing" });

    const params = calledUrl().searchParams;
    expect(params.get("u")).toBe("430052");
    expect(params.get("act")).toBe("rock_climbing");
    expect(params.has("period")).toBe(false);
  });

  // The request behind search_user_outings {user_id: 430052, offset: 480}, which replaced GET /outings?u=…&limit=…
  it("pages a user's outings with offset, most recent first", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 494 }));

    await searchOutings({ user_id: 430052, limit: 10, offset: 480 });

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/outings?u=430052&sort=-date_end&limit=10&offset=480&pl=fr`);
  });

  // AC2.1 on #255: `r=` takes several route IDs, matched as an OR.
  it("sends route_ids as one comma-separated r, in the place of route_id", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 62 }));

    await searchOutings({ activity: "mountain_climbing", route_ids: [54513, 1148298], waypoint_id: 37233 });

    const params = calledUrl().searchParams;
    expect(params.get("r")).toBe("54513,1148298");
    expect(params.getAll("r")).toHaveLength(1);
    expect(mockFetch.mock.calls[0][0]).toContain("?act=mountain_climbing&r=54513%2C1148298&w=37233&sort=-date_end");
  });

  it("sends a one-ID route_ids as route_id sends it", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ route_ids: [54513] });
    await searchOutings({ route_id: 54513 });

    expect(mockFetch.mock.calls[0][0]).toBe(mockFetch.mock.calls[1][0]);
    expect(calledUrl().searchParams.get("r")).toBe("54513");
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

    await expect(searchOutings()).rejects.toThrow("Camptocamp API error: 500 Error");
  });

  // AC6.2 on #153: the outing filters on reported rating, conditions, max elevation and elevation gain.
  it("sends rating, conditions, max elevation and elevation gain after the activity", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({
      area_id: 14409,
      activity: "skitouring",
      rating: { system: "ski_rating", min: "3.1", max: "4.1" },
      condition_at_least: "good",
      elevation_max: { min: 3000, max: 4000 },
      height_diff_up: { min: 1000, max: 1500 },
    });

    expect(mockFetch.mock.calls[0][0]).toBe(
      `${API}/outings?a=14409&act=skitouring&trat=3.1%2C4.1&ocond=excellent%2Cgood&oalt=3000%2C4000&odif=1000%2C1500` +
        "&sort=-date_end&limit=10&offset=0&pl=fr",
    );
  });

  // AC6.3: a min alone keeps every value from min up, a max alone every value up to max.
  it("sends x=min for a min alone", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({
      rating: { system: "global_rating", min: "AD" },
      elevation_max: { min: 3000 },
      height_diff_up: { min: 1000 },
    });

    const params = calledUrl().searchParams;
    expect(params.get("grat")).toBe("AD");
    expect(params.get("oalt")).toBe("3000");
    expect(params.get("odif")).toBe("1000");
  });

  it("sends x=,max for a max alone", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({
      rating: { system: "global_rating", max: "AD" },
      elevation_max: { max: 4000 },
      height_diff_up: { max: 1500 },
    });

    const params = calledUrl().searchParams;
    expect(params.get("grat")).toBe(",AD");
    expect(params.get("oalt")).toBe(",4000");
    expect(params.get("odif")).toBe(",1500");
  });

  it("sends no range parameter when neither bound is given", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ rating: { system: "ski_rating" }, elevation_max: {}, height_diff_up: {} });

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/outings?sort=-date_end&limit=10&offset=0&pl=fr`);
  });

  // `ocond=excellent` alone matches every outing with a condition: the range always starts at excellent,
  // and `excellent,excellent` returns the excellent outings only (live check in the contract tests).
  it.each<[ConditionRating, string]>([
    ["excellent", "excellent,excellent"],
    ["good", "excellent,good"],
    ["average", "excellent,average"],
    ["poor", "excellent,poor"],
    ["awful", "excellent,awful"],
  ])("sends condition_at_least %s as ocond=%s", async (condition, ocond) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ condition_at_least: condition });

    expect(calledUrl().searchParams.get("ocond")).toBe(ocond);
  });

  const outingRatingParams: Array<[OutingRatingField, string]> = [
    ["ski_rating", "trat"],
    ["labande_global_rating", "lrat"],
    ["global_rating", "grat"],
    ["engagement_rating", "erat"],
    ["equipment_rating", "prat"],
    ["ice_rating", "irat"],
    ["rock_free_rating", "frat"],
    ["via_ferrata_rating", "krat"],
    ["hiking_rating", "hrat"],
    ["snowshoe_rating", "wrat"],
    ["mtb_up_rating", "mbur"],
    ["mtb_down_rating", "mbdr"],
  ];

  // The /outings search supports 12 of the 20 route rating systems; the API ignores the others.
  it("covers the 12 outing rating systems", () => {
    expect([...OUTING_RATING_FIELDS].sort()).toEqual(outingRatingParams.map(([field]) => field).sort());
  });

  it.each(outingRatingParams)("maps %s to %s", async (system, param) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ rating: { system, min: "X", max: "Y" } });

    expect(calledUrl().searchParams.get(param)).toBe("X,Y");
  });
});

describe("searchBooks", () => {
  it("calls the exact books URL and keeps author, including null author and activities", async () => {
    // The first two documents and `total` are trimmed from the live GET /books?q=vallot&limit=10&lang=fr
    // response (2026-10-03, 10 documents). No vallot match has a null author or null activities, so the
    // last two documents are copied as returned by GET /books?q=SAONE ET LOIRE ESCALADE (1932410, null
    // author) and GET /books?q=Hugo et le Mont Blanc (14746, null activities) on the same day.
    const mockData = {
      documents: [
        {
          document_id: 209293,
          version: 2,
          locales: [
            {
              version: 3,
              lang: "fr",
              title: "La chaîne du Mont Blanc, Guide Vallot : I - Mont-Blanc - Trélatête",
              summary: null,
            },
          ],
          quality: "medium",
          author: "Lucien Devies, Pierre Henry",
          activities: ["mountain_climbing", "snow_ice_mixed"],
          book_types: ["topo"],
          available_langs: ["fr"],
          protected: false,
          type: "b",
        },
        {
          document_id: 14568,
          version: 3,
          locales: [
            { version: 5, lang: "fr", title: "Topo-guide d'escalade du Vallon Sourn", summary: null },
            { version: 2, lang: "it", title: "topo-guide d'escalade du vallon sourn", summary: null },
          ],
          quality: "medium",
          author: "Philippe Bugada, Patrick Taton",
          activities: ["rock_climbing"],
          book_types: ["topo"],
          available_langs: ["fr", "it"],
          protected: false,
          type: "b",
        },
        {
          document_id: 1932410,
          version: 1,
          locales: [
            {
              version: 1,
              lang: "fr",
              title: "SAONE ET LOIRE ESCALADE 2024",
              summary: "Couvre 16 sites de saone et loire, plus de 1000 lignes au total",
            },
          ],
          quality: "draft",
          author: null,
          activities: ["rock_climbing"],
          book_types: ["topo"],
          available_langs: ["fr"],
          protected: false,
          type: "b",
        },
        {
          document_id: 14746,
          version: 1,
          locales: [{ version: 2, lang: "fr", title: "Hugo et le Mont Blanc", summary: null }],
          quality: "medium",
          author: "Colette Cosnier",
          activities: null,
          book_types: ["novel"],
          available_langs: ["fr"],
          protected: false,
          type: "b",
        },
      ],
      total: 12,
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await searchBooks({ query: "vallot" });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/books?q=vallot&limit=10&pl=fr`);
    expect(result.total).toBe(12);
    expect(wellFormed(result.documents)[0].author).toBe("Lucien Devies, Pierre Henry");
    expect(wellFormed(result.documents)[0].locales[0].summary).toBeNull();
    expect(wellFormed(result.documents)[2].author).toBeNull();
    expect(wellFormed(result.documents)[3].activities).toBeNull();
  });

  it("puts a custom limit in the URL", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchBooks({ query: "x", limit: 5 });

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/books?q=x&limit=5&pl=fr`);
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

    await expect(searchBooks({ query: "vallot" })).rejects.toThrow("Camptocamp API error: 500 Error");
  });
});

describe("getBook", () => {
  it("calls the exact book URL and keeps langs, a null isbn and route title_prefix", async () => {
    // Trimmed from the live GET /books/209293?lang=fr response (2026-10-03): 1 of 23 routes (it and fr
    // locales only; fr summary, areas, geometry and most route fields dropped), 1 of 38 waypoints (areas
    // and geometry dropped), and the 1 image removed.
    const mockData = {
      document_id: 209293,
      version: 2,
      locales: [
        {
          version: 3,
          lang: "fr",
          title: "La chaîne du Mont Blanc, Guide Vallot : I - Mont-Blanc - Trélatête",
          description:
            "1<sup>re</sup> édition 1947, 2<sup>e</sup> édition 1951, addendum en 1955, 3<sup>e</sup> édition en 19736, 4<sup>e</sup> et dernière édition 1978",
          summary: null,
          topic_id: null,
        },
      ],
      quality: "medium",
      author: "Lucien Devies, Pierre Henry",
      editor: "Arthaud",
      activities: ["mountain_climbing", "snow_ice_mixed"],
      url: null,
      isbn: null,
      book_types: ["topo"],
      nb_pages: null,
      publication_date: "1978",
      langs: ["fr"],
      available_langs: ["fr"],
      associations: {
        routes: [
          {
            document_id: 53781,
            version: 59,
            locales: [
              {
                version: 2,
                lang: "it",
                title: "Monte Bianco via Bossesgrat",
                summary: null,
                title_prefix: "Monte Bianco",
              },
              { version: 45, lang: "fr", title: "Arête des Bosses", title_prefix: "Mont Blanc" },
            ],
            quality: "great",
            activities: ["snow_ice_mixed", "skitouring"],
            elevation_max: 4810,
            global_rating: "PD-",
            type: "r",
          },
        ],
        waypoints: [
          {
            document_id: 37295,
            version: 3,
            locales: [{ version: 4, lang: "fr", title: "Dômes de Miage - Sommet W", summary: null }],
            quality: "medium",
            waypoint_type: "summit",
            elevation: 3670,
            available_langs: ["fr"],
            protected: false,
            type: "w",
          },
        ],
        articles: [],
        images: [],
      },
      protected: false,
      type: "b",
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await getBook(209293);

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/books/209293`);
    expect(result.document_id).toBe(209293);
    expect(result.langs).toEqual(["fr"]);
    expect(result.isbn).toBeNull();
    expect(result.url).toBeNull();
    expect(result.publication_date).toBe("1978");
    expect(wellFormed(result.associations?.routes)[0].locales[1].title_prefix).toBe("Mont Blanc");
    expect(wellFormed(result.associations?.waypoints)[0].elevation).toBe(3670);
  });

  it("keeps a free-text isbn and null nb_pages, publication_date and activities", async () => {
    // The live GET /books/14746?lang=fr response (2026-10-03), complete except the fr locale description
    // (1,391 characters live).
    const mockData = {
      document_id: 14746,
      version: 1,
      locales: [{ version: 2, lang: "fr", title: "Hugo et le Mont Blanc", summary: null, topic_id: null }],
      quality: "medium",
      author: "Colette Cosnier",
      editor: "Editions Guérin",
      activities: null,
      url: "http://www.editionsguerin.com/",
      isbn: "2 911755  57 X",
      book_types: ["novel"],
      nb_pages: null,
      publication_date: null,
      langs: ["fr"],
      available_langs: ["fr"],
      associations: { waypoints: [], routes: [], images: [], articles: [] },
      protected: false,
      type: "b",
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await getBook(14746);

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/books/14746`);
    expect(result.isbn).toBe("2 911755  57 X");
    expect(result.nb_pages).toBeNull();
    expect(result.publication_date).toBeNull();
    expect(result.activities).toBeNull();
  });

  it("throws on a 404 response", async () => {
    // Status and body of the live GET /books/999999999?lang=fr response (2026-10-03).
    mockFetch.mockResolvedValueOnce(
      makeResponse(
        { status: "error", errors: [{ location: "body", name: "Not Found", description: "document not found" }] },
        404,
        "Not Found",
      ),
    );

    await expect(getBook(999999999)).rejects.toThrow("Camptocamp API error: 404 Not Found");
  });
});

describe("searchArticles", () => {
  it("calls the exact articles URL and keeps total, article_type and a null summary", async () => {
    // The live GET /articles?q=crampons&limit=10&lang=fr response (2026-10-03), complete.
    const mockData = {
      documents: [
        {
          document_id: 226838,
          version: 4,
          locales: [{ version: 21, lang: "fr", title: "Les crampons", summary: null }],
          quality: "great",
          categories: ["gear"],
          activities: ["mountain_climbing", "snow_ice_mixed", "hiking", "snowshoeing", "skitouring", "ice_climbing"],
          article_type: "collab",
          available_langs: ["fr"],
          protected: false,
          type: "c",
        },
        {
          document_id: 314504,
          version: 1,
          locales: [
            {
              version: 10,
              lang: "fr",
              title: "Chaussures avec crampons intégrés (article à completer)",
              summary: null,
            },
          ],
          quality: "medium",
          categories: ["gear"],
          activities: ["rock_climbing", "snow_ice_mixed", "ice_climbing"],
          article_type: "collab",
          available_langs: ["fr"],
          protected: false,
          type: "c",
        },
        {
          document_id: 665710,
          version: 3,
          locales: [{ version: 19, lang: "fr", title: "Affuter et mettre ses vieux crampons à neuf", summary: null }],
          quality: "fine",
          categories: ["gear"],
          activities: ["snow_ice_mixed", "ice_climbing"],
          article_type: "personal",
          available_langs: ["fr"],
          protected: false,
          type: "c",
        },
      ],
      total: 3,
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await searchArticles({ query: "crampons", limit: 10 });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/articles?q=crampons&limit=10&pl=fr`);
    expect(result.total).toBe(3);
    expect(wellFormed(result.documents)[0].article_type).toBe("collab");
    expect(wellFormed(result.documents)[0].categories).toEqual(["gear"]);
    expect(wellFormed(result.documents)[0].locales[0].summary).toBeNull();
    expect(result.documents).toHaveLength(3);
    expect(wellFormed(result.documents)[2].article_type).toBe("personal");
  });

  it("keeps null activities", async () => {
    // The live GET /articles?q=Du lointain nous nous rappellons&limit=10&lang=fr response (2026-10-03),
    // complete.
    const mockData = {
      documents: [
        {
          document_id: 193302,
          version: 1,
          locales: [{ version: 1, lang: "fr", title: "Du lointain nous nous rappellons", summary: null }],
          quality: "medium",
          categories: ["stories"],
          activities: null,
          article_type: "personal",
          available_langs: ["fr"],
          protected: false,
          type: "c",
        },
      ],
      total: 1,
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await searchArticles({ query: "Du lointain nous nous rappellons", limit: 10 });

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/articles?q=Du+lointain+nous+nous+rappellons&limit=10&pl=fr`);
    expect(result.total).toBe(1);
    expect(wellFormed(result.documents)[0].document_id).toBe(193302);
    expect(wellFormed(result.documents)[0].activities).toBeNull();
    expect(wellFormed(result.documents)[0].categories).toEqual(["stories"]);
  });

  it("puts a custom limit in the URL", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchArticles({ query: "x", limit: 5 });

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/articles?q=x&limit=5&pl=fr`);
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

    await expect(searchArticles({ query: "crampons" })).rejects.toThrow("Camptocamp API error: 500 Error");
  });
});

// AC3.2, AC3.3 of #210: the article filters are acat (category), atyp (type) and act (activity), and the
// query is optional.
describe("article filters on searchArticles", () => {
  function sentUrl(): URL {
    return new URL(mockFetch.mock.calls[0][0] as string);
  }

  it("sends q, acat, atyp and act with the values given", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchArticles({
      query: "avalanche",
      category: "mountain_environment",
      article_type: "collab",
      activity: "skitouring",
    });

    const params = sentUrl().searchParams;
    expect(sentUrl().pathname).toBe("/articles");
    expect(params.get("q")).toBe("avalanche");
    expect(params.get("acat")).toBe("mountain_environment");
    expect(params.get("atyp")).toBe("collab");
    expect(params.get("act")).toBe("skitouring");
  });

  it("sends no q without a query", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchArticles({ category: "c2c_meetings", limit: 2 });

    expect(sentUrl().searchParams.has("q")).toBe(false);
    expect(Object.fromEntries(sentUrl().searchParams)).toEqual({ limit: "2", pl: "fr", acat: "c2c_meetings" });
  });

  it.each<[string, Parameters<typeof searchArticles>[0], string[]]>([
    ["only a category", { category: "gear" }, ["atyp", "act"]],
    ["only an article type", { article_type: "personal" }, ["acat", "act"]],
    ["only an activity", { activity: "skitouring" }, ["acat", "atyp"]],
    ["a query alone", { query: "crampons" }, ["acat", "atyp", "act"]],
  ])("does not send the filters that are not set: %s", async (_name, options, absent) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchArticles(options);

    for (const name of absent) expect(sentUrl().searchParams.has(name), name).toBe(false);
  });

  it("leaves the searchAreas and searchBooks URLs unchanged", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(makeResponse({ documents: [], total: 0 })));

    await searchAreas({ query: "ecrins", limit: 2, offset: 4 });
    await searchBooks({ query: "vanoise", limit: 2, offset: 4 });

    expect(mockFetch.mock.calls.map(([url]) => url as string)).toEqual([
      `${API}/areas?q=ecrins&limit=2&pl=fr&offset=4`,
      `${API}/books?q=vanoise&limit=2&pl=fr&offset=4`,
    ]);
  });
});

describe("getArticle", () => {
  it("calls the exact article URL and keeps the author and associated articles", async () => {
    // Trimmed from the live GET /articles/226838?lang=fr response (2026-10-03): fr description cut to its
    // first 3 lines (4,296 characters live), the 5 images removed, and the associated article's
    // categories and activities dropped.
    const mockData = {
      document_id: 226838,
      version: 4,
      locales: [
        {
          version: 21,
          lang: "fr",
          title: "Les crampons",
          description: "[toc]\n\n## Le nombre de pointes",
          summary: null,
          topic_id: null,
        },
      ],
      quality: "great",
      categories: ["gear"],
      activities: ["mountain_climbing", "snow_ice_mixed", "hiking", "snowshoeing", "skitouring", "ice_climbing"],
      article_type: "collab",
      available_langs: ["fr"],
      associations: {
        waypoints: [],
        routes: [],
        users: [],
        articles: [
          {
            document_id: 1204346,
            version: 2,
            locales: [
              {
                version: 2,
                lang: "fr",
                title: "Portail Matériel",
                summary: 'Article "Portail" à compléter et mettre à jour.',
              },
            ],
            quality: "empty",
            article_type: "collab",
            available_langs: ["fr"],
            protected: false,
            type: "c",
          },
        ],
        outings: [],
        books: [],
        xreports: [],
      },
      author: { name: "Thomas Ribière", user_id: 4060 },
      protected: false,
      type: "c",
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await getArticle(226838);

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/articles/226838`);
    expect(result.document_id).toBe(226838);
    expect(result.author?.user_id).toBe(4060);
    expect(result.author?.name).toBe("Thomas Ribière");
    expect(result.locales[0].description).toBe("[toc]\n\n## Le nombre de pointes");
    expect(result.associations?.articles?.[0].document_id).toBe(1204346);
    expect(result.associations?.routes).toEqual([]);
  });

  it("keeps a route association's title_prefix", async () => {
    // Trimmed from the live GET /articles/302774?lang=fr response (2026-10-03): en description cut to its
    // first 2 lines, 1 of 146 routes kept (routes[0], 45148, reduced to its locales, quality, activities,
    // elevation_min/max, global_rating, available_langs, protected and type), and the associated article's
    // categories and activities dropped. 226838 links no route, so this article supplies the title_prefix.
    const mockData = {
      document_id: 302774,
      version: 1,
      locales: [
        {
          version: 16,
          lang: "en",
          title: "Less difficult alpine routes in the Mont Blanc region",
          description: "\n!! 04 October 2011 - This article is still under construction.",
          summary: null,
          topic_id: 258931,
        },
      ],
      quality: "medium",
      categories: ["topoguide_supplements"],
      activities: ["mountain_climbing", "snow_ice_mixed"],
      article_type: "collab",
      available_langs: ["en"],
      associations: {
        waypoints: [],
        routes: [
          {
            document_id: 45148,
            version: 4,
            locales: [
              { version: 7, lang: "en", title: "N face", summary: null, title_prefix: "Le Portalet" },
              { version: 7, lang: "fr", title: "Face N", summary: null, title_prefix: "Le Portalet" },
            ],
            quality: "medium",
            activities: ["skitouring", "snow_ice_mixed"],
            elevation_min: 1466,
            elevation_max: 3344,
            global_rating: "AD-",
            available_langs: ["en", "fr"],
            protected: false,
            type: "r",
          },
        ],
        users: [],
        images: [],
        articles: [
          {
            document_id: 306206,
            version: 1,
            locales: [
              {
                version: 22,
                lang: "en",
                title: "HELP: How to translate route descriptions in English?",
                summary: null,
              },
            ],
            quality: "medium",
            article_type: "collab",
            available_langs: ["en"],
            protected: false,
            type: "c",
          },
        ],
        outings: [],
        books: [],
        xreports: [],
      },
      author: { name: "Fabien Quétier", user_id: 12542 },
      protected: false,
      type: "c",
    };
    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await getArticle(302774);

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/articles/302774`);
    expect(wellFormed(result.associations?.routes)[0].document_id).toBe(45148);
    expect(wellFormed(result.associations?.routes)[0].locales[0].title_prefix).toBe("Le Portalet");
    expect(wellFormed(result.associations?.routes)[0].locales[1].title).toBe("Face N");
  });

  it("throws on a 404 response", async () => {
    // Status and body of the live GET /articles/999999999?lang=fr response (2026-10-03).
    mockFetch.mockResolvedValueOnce(
      makeResponse(
        { status: "error", errors: [{ location: "body", name: "Not Found", description: "document not found" }] },
        404,
        "Not Found",
      ),
    );

    await expect(getArticle(999999999)).rejects.toThrow("Camptocamp API error: 404 Not Found");
  });
});

// D1: `lang=fr` is a no-op on every endpoint; `pl=<lang>` (default fr) makes a search return one locale per
// document, that language first with the API's own fallback. `pl` does nothing on details, so they send nothing.
describe("locale parameters", () => {
  const searches: Array<[string, () => Promise<unknown>, string]> = [
    ["searchRoutes", () => searchRoutes({ query: "gamma" }), "/routes?q=gamma&limit=10&pl=fr"],
    ["searchWaypoints", () => searchWaypoints({ query: "resegone" }), "/waypoints?q=resegone&limit=10&pl=fr"],
    [
      "searchOutings",
      () => searchOutings({ area_id: 14403 }),
      "/outings?a=14403&sort=-date_end&limit=10&offset=0&pl=fr",
    ],
    ["searchAreas", () => searchAreas({ query: "valais" }), "/areas?q=valais&limit=10&pl=fr"],
    ["searchBooks", () => searchBooks({ query: "vallot" }), "/books?q=vallot&limit=10&pl=fr"],
    ["searchArticles", () => searchArticles({ query: "crampons" }), "/articles?q=crampons&limit=10&pl=fr"],
  ];

  it.each(searches)("%s sends pl=fr and no lang", async (_name, call, expected) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await call();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe(`${API}${expected}`);
    expect(new URL(url).searchParams.has("lang")).toBe(false);
  });

  // AC5.2, AC5.3: the requested language goes out as `pl`, in place of fr.
  const searchesIn: Array<[string, (lang: Lang) => Promise<unknown>, string]> = [
    ["searchRoutes", (lang) => searchRoutes({ query: "gamma", lang }), "/routes"],
    ["searchWaypoints", (lang) => searchWaypoints({ query: "resegone", lang }), "/waypoints"],
    ["searchOutings", (lang) => searchOutings({ area_id: 14403, lang }), "/outings"],
    ["searchAreas", (lang) => searchAreas({ query: "valais", lang }), "/areas"],
    ["searchBooks", (lang) => searchBooks({ query: "vallot", lang }), "/books"],
    ["searchArticles", (lang) => searchArticles({ query: "crampons", lang }), "/articles"],
  ];

  it.each(searchesIn)("%s sends the requested lang as pl", async (_name, call, path) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await call("de");

    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.pathname).toBe(path);
    expect(url.searchParams.getAll("pl")).toEqual(["de"]);
    expect(url.searchParams.has("lang")).toBe(false);
  });

  const details: Array<[string, (id: number) => Promise<unknown>, string]> = [
    ["getRoute", getRoute, "routes"],
    ["getWaypoint", getWaypoint, "waypoints"],
    ["getOuting", getOuting, "outings"],
    ["getArea", getArea, "areas"],
    ["getBook", getBook, "books"],
    ["getArticle", getArticle, "articles"],
  ];

  it.each(details)("%s sends no query string", async (_name, call, path) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ...MINIMAL_DETAIL, document_id: 675555 }));

    await call(675555);

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/${path}/675555`);
  });
});

// AC2.1, AC2.2: every endpoint goes through getJson, so each one sends the User-Agent and an abort signal.
describe("request headers and timeout signal", () => {
  const packageVersion = (
    JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }
  ).version;

  const calls: Array<[string, () => Promise<unknown>]> = [
    ["searchRoutes", () => searchRoutes({ query: "gamma" })],
    ["getRoute", () => getRoute(53914)],
    ["searchWaypoints", () => searchWaypoints({ query: "resegone" })],
    ["getWaypoint", () => getWaypoint(37305)],
    ["getOuting", () => getOuting(1525071)],
    ["searchOutings", () => searchOutings({ area_id: 14403 })],
    ["searchAreas", () => searchAreas({ query: "valais" })],
    ["getArea", () => getArea(14403)],
    ["searchBooks", () => searchBooks({ query: "vallot" })],
    ["getBook", () => getBook(183333)],
    ["searchArticles", () => searchArticles({ query: "crampons" })],
    ["getArticle", () => getArticle(1066806)],
  ];

  it.each(calls)("%s sends the User-Agent and an AbortSignal", async (_name, call) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0, ...MINIMAL_DETAIL }));

    await call();

    expect(mockFetch).toHaveBeenCalledOnce();
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init.headers).get("User-Agent")).toBe(
      `mcp-camptocamp/${packageVersion} (+https://github.com/olaurendeau/mcp-camptocamp)`,
    );
  });
});
