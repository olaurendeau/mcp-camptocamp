import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchRoutes,
  getRoute,
  searchWaypoints,
  getWaypoint,
  searchUserOutings,
  getOuting,
  searchAreas,
  getArea,
  searchOutings,
  searchBooks,
  getBook,
  searchArticles,
  getArticle,
} from "../../src/api/camptocamp.js";
import { outingDetailSchema, routeDetailSchema } from "../../src/api/schemas.js";

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
    expect(result.documents[0].document_id).toBe(123);
    expect(result.documents[0].locales[0].title).toBe("Voie normale Mont Blanc");
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
    expect(result.documents[0].elevation).toBe(4808);
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 503));

    await expect(searchWaypoints({ query: "test" })).rejects.toThrow("Camptocamp API error: 503");
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

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 404));

    await expect(getWaypoint(999)).rejects.toThrow("Camptocamp API error: 404");
  });
});

describe("searchUserOutings", () => {
  it("calls the correct URL and returns parsed response", async () => {
    const mockData = {
      documents: [
        {
          document_id: 1915495,
          locales: [{ lang: "fr", title: "Valle dell'Orco - Sergent : Nautilus" }],
          activities: ["rock_climbing"],
          date_start: "2026-06-14",
          date_end: "2026-06-14",
          global_rating: "TD",
          author: { name: "o.laurendeau", user_id: 430052 },
        },
      ],
      total: 42,
    };

    mockFetch.mockResolvedValueOnce(makeResponse(mockData));

    const result = await searchUserOutings({ user_id: 430052 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/outings");
    expect(url).toContain("u=430052");
    expect(url).toContain("pl=fr");

    expect(result.total).toBe(42);
    expect(result.documents[0].document_id).toBe(1915495);
    expect(result.documents[0].author?.name).toBe("o.laurendeau");
  });

  it("puts a custom limit in the URL", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchUserOutings({ user_id: 430052, limit: 5 });

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/outings?u=430052&limit=5&pl=fr`);
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

    await expect(searchUserOutings({ user_id: 430052 })).rejects.toThrow("Camptocamp API error: 500");
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

    const route = result.associations?.routes?.[0];
    expect(route?.document_id).toBe(54085);
    expect(route?.locales[0].title_prefix).toBe("Mont Pourri");
    expect(route?.locales[1].title_prefix).toBe("Mont Pourri");
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
    expect(result.documents[0].area_type).toBe("range");
    expect(result.documents[0].locales[0].title).toBe("Écrins");
  });

  it("adds atyp only when an area type is given, keeping the real locale order", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [AREA_VALAIS_E], total: 2 }));

    const result = await searchAreas({ query: "valais", area_type: "range" });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe(`${API}/areas?q=valais&limit=10&pl=fr&atyp=range`);
    expect(url.endsWith("&atyp=range")).toBe(true);
    expect(result.total).toBe(2);
    expect(result.documents[0].locales[0].lang).toBe("sl");
    expect(result.documents[0].locales[3]).toMatchObject({
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
    expect(result.areas?.map((a) => a.area_type)).toEqual(["country", "admin_limits", "range"]);
    expect(result.areas?.[1].locales[6]).toMatchObject({ lang: "fr", title: "Hautes-Alpes" });
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

  it("sends only sort, limit, offset and pl when no filter is given", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [OUTING_COSMIQUES, OUTING_SKITOURING], total: 14 }));

    const result = await searchOutings();

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/outings?sort=-date_end&limit=10&offset=0&pl=fr`);
    expect(result.total).toBe(14);
    expect(result.documents[0].areas?.[1].area_type).toBe("range");
    expect(result.documents[0].condition_rating).toBe("average");
    expect(result.documents[0].ski_rating).toBeUndefined();
    expect(result.documents[1].ski_rating).toBe("3.1");
    expect(result.documents[1].labande_global_rating).toBe("PD+");
    expect(result.documents[1].global_rating).toBeUndefined();
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

  it("sends custom limit and offset and no unset filter", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchOutings({ limit: 25, offset: 50 });

    const params = calledUrl().searchParams;
    expect(params.get("limit")).toBe("25");
    expect(params.get("offset")).toBe("50");
    for (const name of ["q", "a", "act", "date", "r", "w"]) {
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

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

    await expect(searchOutings()).rejects.toThrow("Camptocamp API error: 500 Error");
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
    expect(result.documents[0].author).toBe("Lucien Devies, Pierre Henry");
    expect(result.documents[0].locales[0].summary).toBeNull();
    expect(result.documents[2].author).toBeNull();
    expect(result.documents[3].activities).toBeNull();
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
    expect(result.associations?.routes?.[0].locales[1].title_prefix).toBe("Mont Blanc");
    expect(result.associations?.waypoints?.[0].elevation).toBe(3670);
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
    expect(result.documents[0].article_type).toBe("collab");
    expect(result.documents[0].categories).toEqual(["gear"]);
    expect(result.documents[0].locales[0].summary).toBeNull();
    expect(result.documents).toHaveLength(3);
    expect(result.documents[2].article_type).toBe("personal");
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
    expect(result.documents[0].document_id).toBe(193302);
    expect(result.documents[0].activities).toBeNull();
    expect(result.documents[0].categories).toEqual(["stories"]);
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
    expect(result.associations?.routes?.[0].document_id).toBe(45148);
    expect(result.associations?.routes?.[0].locales[0].title_prefix).toBe("Le Portalet");
    expect(result.associations?.routes?.[0].locales[1].title).toBe("Face N");
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

// D1: `lang=fr` is a no-op on every endpoint; `pl=fr` makes a search return one locale per document,
// French first with the API's own fallback. `pl` does nothing on detail endpoints, so they send nothing.
describe("locale parameters", () => {
  const searches: Array<[string, () => Promise<unknown>, string]> = [
    ["searchRoutes", () => searchRoutes({ query: "gamma" }), "/routes?q=gamma&limit=10&pl=fr"],
    ["searchWaypoints", () => searchWaypoints({ query: "resegone" }), "/waypoints?q=resegone&limit=10&pl=fr"],
    ["searchUserOutings", () => searchUserOutings({ user_id: 430052 }), "/outings?u=430052&limit=10&pl=fr"],
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

  const details: Array<[string, (id: number) => Promise<unknown>, string]> = [
    ["getRoute", getRoute, "routes"],
    ["getWaypoint", getWaypoint, "waypoints"],
    ["getOuting", getOuting, "outings"],
    ["getArea", getArea, "areas"],
    ["getBook", getBook, "books"],
    ["getArticle", getArticle, "articles"],
  ];

  it.each(details)("%s sends no query string", async (_name, call, path) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ document_id: 675555, locales: [] }));

    await call(675555);

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/${path}/675555`);
  });
});
