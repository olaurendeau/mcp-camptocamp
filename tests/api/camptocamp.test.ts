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
} from "../../src/api/camptocamp.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(data),
  };
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

    const result = await searchRoutes("Mont Blanc");

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/routes");
    expect(url).toContain("q=Mont+Blanc");
    expect(url).toContain("lang=fr");

    expect(result.total).toBe(1);
    expect(result.documents[0].document_id).toBe(123);
    expect(result.documents[0].locales[0].title).toBe("Voie normale Mont Blanc");
  });

  it("respects custom limit and lang", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchRoutes("test", 5, "en");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("limit=5");
    expect(url).toContain("lang=en");
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

    await expect(searchRoutes("test")).rejects.toThrow("Camptocamp API error: 500");
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

    const result = await searchWaypoints("Mont Blanc");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/waypoints");
    expect(url).toContain("q=Mont+Blanc");

    expect(result.total).toBe(1);
    expect(result.documents[0].elevation).toBe(4808);
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 503));

    await expect(searchWaypoints("test")).rejects.toThrow("Camptocamp API error: 503");
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

    const result = await searchUserOutings(430052);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/outings");
    expect(url).toContain("u=430052");
    expect(url).toContain("lang=fr");

    expect(result.total).toBe(42);
    expect(result.documents[0].document_id).toBe(1915495);
    expect(result.documents[0].author?.name).toBe("o.laurendeau");
  });

  it("respects custom limit and lang", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

    await searchUserOutings(430052, 5, "en");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("limit=5");
    expect(url).toContain("lang=en");
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

    await expect(searchUserOutings(430052)).rejects.toThrow("Camptocamp API error: 500");
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

    const result = await searchAreas("ecrins");

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/areas?q=ecrins&limit=10&lang=fr`);
    expect(result.total).toBe(1);
    expect(result.documents[0].area_type).toBe("range");
    expect(result.documents[0].locales[0].title).toBe("Écrins");
  });

  it("adds atyp only when an area type is given, keeping the real locale order", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ documents: [AREA_VALAIS_E], total: 2 }));

    const result = await searchAreas("valais", 10, "fr", "range");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe(`${API}/areas?q=valais&limit=10&lang=fr&atyp=range`);
    expect(url.endsWith("&atyp=range")).toBe(true);
    expect(result.total).toBe(2);
    expect(result.documents[0].locales[0].lang).toBe("sl");
    expect(result.documents[0].locales[3]).toMatchObject({
      lang: "fr",
      title: "Valais E - Alpes Pennines E",
    });
  });

  it("throws on a 500 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Error",
      json: () => Promise.resolve({}),
    });

    await expect(searchAreas("ecrins")).rejects.toThrow("Camptocamp API error: 500 Error");
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
    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/areas/14403?lang=fr`);
    expect(result.document_id).toBe(14403);
    expect(result.area_type).toBe("range");
    expect(result.locales[0].summary).toBe(summary);
    expect(result.locales[0].description).toContain("[toc]");
    expect(result.geometry?.geom).toBeNull();
  });

  it("throws on a 404 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: () => Promise.resolve({ status: "error", errors: [{ name: "Not Found" }] }),
    });

    await expect(getArea(999999999)).rejects.toThrow("Camptocamp API error: 404");
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

        await fn("Mont Blanc");

        expect(mockFetch.mock.calls[0][0]).toBe(`${API}/${path}?q=Mont+Blanc&limit=10&lang=fr`);
      });

      it("appends a= after the existing parameters when an area is given", async () => {
        mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

        await fn("couloir", 10, "fr", 14403);

        expect(mockFetch.mock.calls[0][0]).toBe(`${API}/${path}?q=couloir&limit=10&lang=fr&a=14403`);
      });

      it("omits q= when the query is undefined", async () => {
        mockFetch.mockResolvedValueOnce(makeResponse({ documents: [], total: 0 }));

        await fn(undefined, 10, "fr", 14403);

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toBe(`${API}/${path}?limit=10&lang=fr&a=14403`);
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

    expect(mockFetch.mock.calls[0][0]).toBe(`${API}/routes/54275?lang=fr`);
    expect(result.areas?.[0].document_id).toBe(14274);
    expect(result.areas?.map((a) => a.area_type)).toEqual(["country", "admin_limits", "range"]);
    expect(result.areas?.[1].locales[6]).toMatchObject({ lang: "fr", title: "Hautes-Alpes" });
  });
});
