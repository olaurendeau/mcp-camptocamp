import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleSearchRoutes,
  handleGetRoute,
  searchRoutesSchema,
  routeToolDefinitions,
} from "../../src/tools/routes.js";
import * as api from "../../src/api/camptocamp.js";

vi.mock("../../src/api/camptocamp.js");

const mockSearchRoutes = vi.mocked(api.searchRoutes);
const mockGetRoute = vi.mocked(api.getRoute);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleSearchRoutes", () => {
  it("formats results correctly", async () => {
    // Fixture mirrors the real API v6 shape: documents carry document_id, not id
    mockSearchRoutes.mockResolvedValueOnce({
      total: 2,
      documents: [
        {
          document_id: 57842,
          locales: [
            { lang: "es", title: "via gamma", title_prefix: "Barre des Écrins" },
            { lang: "fr", title: "Voie Gamma", title_prefix: "Barre des Écrins" },
          ],
          activities: ["mountain_climbing"],
          elevation_max: 4102,
          height_diff_difficulties: 1100,
          global_rating: "ED",
          rock_free_rating: "6b+",
        },
        {
          document_id: 53914,
          locales: [{ lang: "fr", title: "Arête des Cosmiques" }],
          activities: ["rock_climbing"],
          elevation_max: 3842,
        },
      ],
    });

    const result = await handleSearchRoutes({ query: "Barre des Écrins", limit: 10 });

    expect(result).toContain("Found 2 route(s)");
    expect(result).toContain("[57842] Voie Gamma");
    expect(result).toContain("4102m");
    expect(result).toContain("Rating: ED");
    expect(result).toContain("[53914] Arête des Cosmiques");
    expect(result).not.toContain("undefined");
  });

  it("returns empty message when no results", async () => {
    mockSearchRoutes.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await handleSearchRoutes({ query: "xyznotfound", limit: 10 });

    expect(result).toBe("No routes found.");
  });

  it("falls back to first locale if fr not found", async () => {
    mockSearchRoutes.mockResolvedValueOnce({
      total: 1,
      documents: [
        {
          document_id: 10,
          locales: [{ lang: "en", title: "English Title" }],
          activities: ["hiking"],
        },
      ],
    });

    const result = await handleSearchRoutes({ query: "test", limit: 10 });

    expect(result).toContain("English Title");
  });
});

describe("handleGetRoute", () => {
  it("formats route detail correctly", async () => {
    mockGetRoute.mockResolvedValueOnce({
      document_id: 42,
      locales: [
        {
          lang: "fr",
          title: "Arête des Cosmiques",
          description: "Belle arête mixte accessible depuis l'Aiguille du Midi.",
          gear: "Crampons, piolet, corde 50m",
        },
      ],
      activities: ["rock_climbing", "ice_climbing"],
      elevation_max: 3842,
      elevation_min: 3777,
      height_diff_up: 65,
      global_rating: "TD",
      rock_free_rating: "5c",
      engagement_rating: "E2",
    });

    const result = await handleGetRoute({ id: 42 });

    expect(result).toContain("Arête des Cosmiques");
    expect(result).toContain("ID: 42");
    expect(result).not.toContain("undefined");
    expect(result).toContain("TD");
    expect(result).toContain("5c");
    expect(result).toContain("3842m");
    expect(result).toContain("Belle arête mixte");
    expect(result).toContain("Crampons");
  });

  it("handles route with minimal data", async () => {
    mockGetRoute.mockResolvedValueOnce({
      document_id: 99,
      locales: [{ lang: "fr", title: "Simple route" }],
      activities: ["hiking"],
    });

    const result = await handleGetRoute({ id: 99 });

    expect(result).toContain("Simple route");
    expect(result).toContain("ID: 99");
    expect(result).toContain("hiking");
    expect(result).not.toContain("undefined");
  });

  it("propagates API errors", async () => {
    mockGetRoute.mockRejectedValueOnce(new Error("Camptocamp API error: 404"));

    await expect(handleGetRoute({ id: 999 })).rejects.toThrow("Camptocamp API error: 404");
  });
});

describe("handleSearchRoutes with area_id", () => {
  it('schema rejects area_id 0, -1, 1.5 and "abc", and accepts 14403', () => {
    for (const area_id of [0, -1, 1.5, "abc"]) {
      expect(searchRoutesSchema.safeParse({ query: "couloir", area_id }).success).toBe(false);
    }
    const parsed = searchRoutesSchema.safeParse({ query: "couloir", area_id: 14403 });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.area_id).toBe(14403);
  });

  it("schema accepts a missing query and a missing area_id", () => {
    expect(searchRoutesSchema.safeParse({ area_id: 14403 }).success).toBe(true);
    expect(searchRoutesSchema.safeParse({ query: "couloir" }).success).toBe(true);
  });

  it("passes query and area_id to the API", async () => {
    mockSearchRoutes.mockResolvedValueOnce({ total: 0, documents: [] });

    await handleSearchRoutes({ query: "couloir", limit: 10, area_id: 14403 });

    expect(mockSearchRoutes).toHaveBeenCalledWith({ query: "couloir", limit: 10, area_id: 14403 });
  });

  it("passes no area to the API and keeps today's messages without area_id", async () => {
    mockSearchRoutes.mockResolvedValueOnce({
      total: 12,
      documents: [
        {
          document_id: 54275,
          locales: [{ lang: "fr", title: "Couloir NE", title_prefix: "Pic de Neige Cordier" }],
          activities: ["snow_ice_mixed", "skitouring"],
          elevation_max: 3614,
          global_rating: "AD",
        },
      ],
    });

    const result = await handleSearchRoutes({ query: "x", limit: 10 });

    expect(mockSearchRoutes).toHaveBeenCalledWith({ query: "x", limit: 10 });
    expect(result.split("\n")[0]).toBe("Found 12 route(s). Showing 1:");

    mockSearchRoutes.mockResolvedValueOnce({ total: 0, documents: [] });
    expect(await handleSearchRoutes({ query: "x", limit: 10 })).toBe("No routes found.");
  });

  it("scopes the header to the area with area_id", async () => {
    mockSearchRoutes.mockResolvedValueOnce({
      total: 294,
      documents: Array.from({ length: 10 }, () => ({
        document_id: 54275,
        locales: [{ lang: "fr", title: "Couloir NE", title_prefix: "Pic de Neige Cordier" }],
        activities: ["snow_ice_mixed", "skitouring"],
        elevation_max: 3614,
        global_rating: "AD",
      })),
    });

    const result = await handleSearchRoutes({ query: "couloir", limit: 10, area_id: 14403 });

    expect(result.split("\n")[0]).toBe("Found 294 route(s) in area 14403. Showing 10:");
    expect(result).toContain("[54275] Couloir NE");
    expect(result).not.toContain("undefined");
  });

  it("scopes the empty message to the area with area_id", async () => {
    mockSearchRoutes.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await handleSearchRoutes({ query: "couloir", limit: 10, area_id: 999999999 });

    expect(result).toBe("No routes found in area 999999999.");
  });

  it("returns exactly the area-scoped empty message for area 14403", async () => {
    mockSearchRoutes.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await handleSearchRoutes({ query: "xyznotfound", limit: 10, area_id: 14403 });

    expect(result).toBe("No routes found in area 14403.");
  });

  it("searches by area_id alone, without a query", async () => {
    mockSearchRoutes.mockResolvedValueOnce({
      total: 294,
      documents: [
        {
          document_id: 54275,
          locales: [{ lang: "fr", title: "Couloir NE", title_prefix: "Pic de Neige Cordier" }],
          activities: ["snow_ice_mixed", "skitouring"],
          elevation_max: 3614,
          global_rating: "AD",
        },
      ],
    });

    const result = await handleSearchRoutes({ area_id: 14403, limit: 10 });

    expect(mockSearchRoutes).toHaveBeenCalledWith({ limit: 10, area_id: 14403 });
    expect(result).toContain("in area 14403");
  });

  it("rejects a call with neither query nor area_id without calling the API", async () => {
    await expect(handleSearchRoutes({ limit: 10 })).rejects.toThrow("query, an area_id");
    expect(mockSearchRoutes).not.toHaveBeenCalled();
  });

  it("treats a blank query as missing", async () => {
    await expect(handleSearchRoutes({ query: "  ", limit: 10 })).rejects.toThrow("query, an area_id");
    await expect(handleSearchRoutes({ query: "", limit: 10 })).rejects.toThrow("query, an area_id");
    expect(mockSearchRoutes).not.toHaveBeenCalled();
  });

  it("drops a blank query when area_id is given", async () => {
    mockSearchRoutes.mockResolvedValueOnce({ total: 0, documents: [] });

    await handleSearchRoutes({ query: "  ", limit: 10, area_id: 14403 });

    expect(mockSearchRoutes).toHaveBeenCalledWith({ limit: 10, area_id: 14403 });
  });
});

// Real `areas` of route 54275 (GET /routes/54275?lang=fr): fr is not the first locale for
// France and Hautes-Alpes, and Écrins has only fr. Untyped version/protected/type fields omitted.
const areasOf54275: api.AreaSearchResult[] = [
  {
    document_id: 14274,
    locales: [
      { lang: "zh", title: "法国" },
      { lang: "sl", title: "Francija" },
      { lang: "fr", title: "France" },
      { lang: "ca", title: "França" },
      { lang: "de", title: "Frankreich" },
      { lang: "en", title: "France" },
      { lang: "es", title: "Francia" },
      { lang: "eu", title: "France" },
      { lang: "it", title: "Francia" },
    ],
    area_type: "country",
    available_langs: null,
  },
  {
    document_id: 14361,
    locales: [
      { lang: "zh", title: "上阿尔卑斯省" },
      { lang: "ca", title: "Alts Alps" },
      { lang: "de", title: "Hautes-Alpes" },
      { lang: "en", title: "Hautes-Alpes" },
      { lang: "es", title: "Altos Alpes" },
      { lang: "eu", title: "Alpe Garaiak" },
      { lang: "fr", title: "Hautes-Alpes" },
      { lang: "it", title: "Alte Alpi" },
    ],
    area_type: "admin_limits",
    available_langs: null,
  },
  {
    document_id: 14403,
    locales: [{ lang: "fr", title: "Écrins" }],
    area_type: "range",
    available_langs: null,
  },
];

const route54275 = {
  document_id: 54275,
  locales: [
    {
      lang: "fr",
      title: "Grand couloir N - Goulotte Allera - Pelatan",
      description: "Itinéraire de goulotte.",
    },
  ],
  activities: ["mountain_climbing", "snow_ice_mixed"],
  elevation_max: 3769,
  global_rating: "TD",
};

describe("handleGetRoute areas", () => {
  it("lists the areas with fr titles, in API order, after the elevation and before the description", async () => {
    mockGetRoute.mockResolvedValueOnce({ ...route54275, areas: areasOf54275 });

    const result = await handleGetRoute({ id: 54275 });

    const lines = result.split("\n");
    const heading = lines.indexOf("## Areas");
    const maxElevation = lines.indexOf("**Max elevation**: 3769m");
    expect(maxElevation).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(maxElevation);
    expect(lines.slice(heading, heading + 4)).toEqual([
      "## Areas",
      "- [14274] France (country)",
      "- [14361] Hautes-Alpes (admin_limits)",
      "- [14403] Écrins (range)",
    ]);
    expect(heading).toBeLessThan(lines.indexOf("## Description"));
    expect(result).not.toContain("undefined");
  });

  it.each([
    ["missing", undefined],
    ["empty", []],
    ["null", null],
  ])("has no Areas section when areas is %s", async (_label, areas) => {
    mockGetRoute.mockResolvedValueOnce({ ...route54275, areas });

    const result = await handleGetRoute({ id: 54275 });

    expect(result).not.toContain("## Areas");
    expect(result).not.toContain("undefined");
    expect(result).toContain("## Description");
  });

  it("shows Untitled for an area with empty locales", async () => {
    mockGetRoute.mockResolvedValueOnce({
      ...route54275,
      areas: [{ document_id: 14403, locales: [], area_type: "range", available_langs: null }],
    });

    const result = await handleGetRoute({ id: 54275 });

    expect(result).toContain("- [14403] Untitled (range)");
    expect(result).not.toContain("undefined");
  });
});

describe("get_route tool definition", () => {
  it("tells the LLM about the areas section and area_id reuse", () => {
    const tool = routeToolDefinitions.find((t) => t.name === "get_route");

    expect(tool?.description).toContain("the areas it belongs to");
    expect(tool?.description).toContain(
      "Area IDs can be passed as area_id to search_routes, search_waypoints and search_outings.",
    );
  });
});
