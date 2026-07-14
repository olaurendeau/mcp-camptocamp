import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchRoutes,
  getRoute,
  searchWaypoints,
  getWaypoint,
  searchUserOutings,
  getOuting,
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
