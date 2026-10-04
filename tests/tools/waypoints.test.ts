import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleSearchWaypoints,
  handleGetWaypoint,
  searchWaypointsSchema,
  waypointToolDefinitions,
} from "../../src/tools/waypoints.js";
import { USER_TEXT_NOTE } from "../../src/tools/text.js";
import * as api from "../../src/api/camptocamp.js";
import { waypointDetailSchema, waypointSearchResponseSchema } from "../../src/api/schemas.js";
import { throughSchema } from "./through-schema.js";

vi.mock("../../src/api/camptocamp.js");

const mockSearchWaypoints = throughSchema(vi.mocked(api.searchWaypoints), waypointSearchResponseSchema);
const mockGetWaypoint = throughSchema(vi.mocked(api.getWaypoint), waypointDetailSchema);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleSearchWaypoints", () => {
  it("formats results correctly", async () => {
    // Fixture mirrors the real API v6 shape: documents carry document_id, not id
    mockSearchWaypoints.mockResolvedValueOnce({
      total: 3,
      documents: [
        {
          document_id: 38591,
          locales: [{ lang: "fr", title: "Barre des Écrins" }],
          waypoint_type: "summit",
          elevation: 4102,
        },
        {
          document_id: 105865,
          locales: [{ lang: "fr", title: "Refuge du Goûter" }],
          waypoint_type: "hut",
          elevation: 3835,
        },
        {
          document_id: 107427,
          locales: [{ lang: "fr", title: "Col du Midi" }],
          waypoint_type: "col",
        },
      ],
    });

    const result = await handleSearchWaypoints({ query: "Mont Blanc", limit: 10 });

    expect(result).toContain("Found 3 waypoint(s)");
    expect(result).toContain("[38591] Barre des Écrins (summit) | 4102m");
    expect(result).toContain("[105865] Refuge du Goûter (hut) | 3835m");
    expect(result).toContain("[107427] Col du Midi (col)");
    expect(result).not.toContain("undefined");
  });

  it("returns empty message when no results", async () => {
    mockSearchWaypoints.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await handleSearchWaypoints({ query: "xyznotfound", limit: 10 });

    expect(result).toBe("No waypoints found.");
  });

  it("falls back to first locale if fr not found", async () => {
    mockSearchWaypoints.mockResolvedValueOnce({
      total: 1,
      documents: [
        {
          document_id: 5,
          locales: [{ lang: "de", title: "Großglockner" }],
          waypoint_type: "summit",
          elevation: 3798,
        },
      ],
    });

    const result = await handleSearchWaypoints({ query: "Grossglockner", limit: 10 });

    expect(result).toContain("Großglockner");
  });
});

describe("handleGetWaypoint", () => {
  it("formats waypoint detail correctly", async () => {
    // Real API shape: no lat/lng fields, geometry.geom is a Web Mercator GeoJSON string
    mockGetWaypoint.mockResolvedValueOnce({
      document_id: 38591,
      locales: [
        {
          lang: "fr",
          title: "Barre des Écrins",
          description: "La plus haute montagne du Dauphiné.",
          access: "Depuis le refuge des Écrins.",
        },
      ],
      waypoint_type: "summit",
      elevation: 4102,
      geometry: {
        geom: '{"type": "Point", "coordinates": [707938.5280896387, 5609273.911974903]}',
      },
    });

    const result = await handleGetWaypoint({ id: 38591 });

    expect(result.split("\n").slice(0, 2)).toEqual([
      "# Barre des Écrins (ID: 38591)",
      "**URL**: https://www.camptocamp.org/waypoints/38591",
    ]);
    expect(result).toContain("summit");
    expect(result).toContain("4102m");
    expect(result).toContain("**Coordinates**: 44.92215, 6.35952");
    expect(result).toContain("La plus haute montagne");
    expect(result).toContain("refuge des Écrins");
    expect(result).not.toContain("undefined");
  });

  it("handles waypoint without coordinates", async () => {
    mockGetWaypoint.mockResolvedValueOnce({
      document_id: 77,
      locales: [{ lang: "fr", title: "Bivouac sans GPS" }],
      waypoint_type: "bivouac",
      elevation: 2500,
    });

    const result = await handleGetWaypoint({ id: 77 });

    expect(result).toContain("Bivouac sans GPS");
    expect(result).toContain("2500m");
    expect(result).not.toContain("Coordinates");
  });

  it("propagates API errors", async () => {
    mockGetWaypoint.mockRejectedValueOnce(new Error("Camptocamp API error: 404"));

    await expect(handleGetWaypoint({ id: 999 })).rejects.toThrow("Camptocamp API error: 404");
  });
});

describe("handleSearchWaypoints with area_id", () => {
  it('schema rejects area_id 0, -1, 1.5 and "abc", and accepts 14403', () => {
    for (const area_id of [0, -1, 1.5, "abc"]) {
      expect(searchWaypointsSchema.safeParse({ query: "refuge", area_id }).success).toBe(false);
    }
    const parsed = searchWaypointsSchema.safeParse({ query: "refuge", area_id: 14403 });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.area_id).toBe(14403);
  });

  it("schema accepts a missing query and a missing area_id", () => {
    expect(searchWaypointsSchema.safeParse({ area_id: 14403 }).success).toBe(true);
    expect(searchWaypointsSchema.safeParse({ query: "refuge" }).success).toBe(true);
  });

  it("passes query and area_id to the API", async () => {
    mockSearchWaypoints.mockResolvedValueOnce({ total: 0, documents: [] });

    await handleSearchWaypoints({ query: "refuge", limit: 10, area_id: 14403 });

    expect(mockSearchWaypoints).toHaveBeenCalledWith({ query: "refuge", limit: 10, area_id: 14403 });
  });

  it("passes no area to the API and keeps today's messages without area_id", async () => {
    mockSearchWaypoints.mockResolvedValueOnce({
      total: 12,
      documents: [
        {
          document_id: 104143,
          locales: [{ lang: "fr", title: "Refuge du Glacier Blanc" }],
          waypoint_type: "hut",
          elevation: 2542,
        },
      ],
    });

    const result = await handleSearchWaypoints({ query: "x", limit: 10 });

    expect(mockSearchWaypoints).toHaveBeenCalledWith({ query: "x", limit: 10 });
    expect(result.split("\n")[0]).toBe("Found 12 waypoint(s). Showing 1:");

    mockSearchWaypoints.mockResolvedValueOnce({ total: 0, documents: [] });
    expect(await handleSearchWaypoints({ query: "x", limit: 10 })).toBe("No waypoints found.");
  });

  it("scopes the header to the area with area_id", async () => {
    mockSearchWaypoints.mockResolvedValueOnce({
      total: 37,
      documents: Array.from({ length: 10 }, () => ({
        document_id: 104143,
        locales: [{ lang: "fr", title: "Refuge du Glacier Blanc" }],
        waypoint_type: "hut",
        elevation: 2542,
      })),
    });

    const result = await handleSearchWaypoints({ query: "refuge", limit: 10, area_id: 14403 });

    expect(result.split("\n")[0]).toBe("Found 37 waypoint(s) in area 14403. Showing 10:");
    expect(result).toContain("[104143] Refuge du Glacier Blanc (hut) | 2542m");
    expect(result).not.toContain("undefined");
  });

  it("scopes the empty message to the area with area_id", async () => {
    mockSearchWaypoints.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await handleSearchWaypoints({ query: "refuge", limit: 10, area_id: 999999999 });

    expect(result).toBe("No waypoints found in area 999999999.");
  });

  it("returns exactly the area-scoped empty message for area 14403", async () => {
    mockSearchWaypoints.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await handleSearchWaypoints({ query: "xyznotfound", limit: 10, area_id: 14403 });

    expect(result).toBe("No waypoints found in area 14403.");
  });

  it("searches by area_id alone, without a query", async () => {
    mockSearchWaypoints.mockResolvedValueOnce({
      total: 37,
      documents: [
        {
          document_id: 104143,
          locales: [{ lang: "fr", title: "Refuge du Glacier Blanc" }],
          waypoint_type: "hut",
          elevation: 2542,
        },
      ],
    });

    const result = await handleSearchWaypoints({ area_id: 14403, limit: 10 });

    expect(mockSearchWaypoints).toHaveBeenCalledWith({ limit: 10, area_id: 14403 });
    expect(result).toContain("in area 14403");
  });

  it("rejects a call with neither query nor area_id without calling the API", async () => {
    await expect(handleSearchWaypoints({ limit: 10 })).rejects.toThrow("query, an area_id");
    expect(mockSearchWaypoints).not.toHaveBeenCalled();
  });

  it("treats a blank query as missing", async () => {
    await expect(handleSearchWaypoints({ query: "  ", limit: 10 })).rejects.toThrow("query, an area_id");
    await expect(handleSearchWaypoints({ query: "", limit: 10 })).rejects.toThrow("query, an area_id");
    expect(mockSearchWaypoints).not.toHaveBeenCalled();
  });

  it("drops a blank query when area_id is given", async () => {
    mockSearchWaypoints.mockResolvedValueOnce({ total: 0, documents: [] });

    await handleSearchWaypoints({ query: "  ", limit: 10, area_id: 14403 });

    expect(mockSearchWaypoints).toHaveBeenCalledWith({ limit: 10, area_id: 14403 });
  });
});

// Real `areas` of waypoint 104143 (GET /waypoints/104143?lang=fr): fr is not the first locale for
// France and Hautes-Alpes, and Écrins has only fr. Untyped version/protected/type fields omitted.
const areasOf104143: api.AreaSearchResult[] = [
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

const waypoint104143 = {
  document_id: 104143,
  locales: [
    { lang: "en", title: "Glacier Blanc hut" },
    { lang: "fr", title: "Refuge du Glacier Blanc", description: "Refuge au pied du Glacier Blanc." },
  ],
  waypoint_type: "hut",
  elevation: 2542,
  geometry: {
    geom: '{"type": "Point", "coordinates": [713737.1603650594, 5611696.464737642]}',
  },
};

describe("handleGetWaypoint areas", () => {
  it("lists the areas with fr titles, in API order, after the coordinates and before the description", async () => {
    mockGetWaypoint.mockResolvedValueOnce({ ...waypoint104143, areas: areasOf104143 });

    const result = await handleGetWaypoint({ id: 104143 });

    const lines = result.split("\n");
    const heading = lines.indexOf("## Areas");
    const coordinates = lines.findIndex((l) => l.startsWith("**Coordinates**"));
    expect(coordinates).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(coordinates);
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
    mockGetWaypoint.mockResolvedValueOnce({ ...waypoint104143, areas });

    const result = await handleGetWaypoint({ id: 104143 });

    expect(result).not.toContain("## Areas");
    expect(result).not.toContain("undefined");
    expect(result).toContain("## Description");
  });

  it("shows Untitled for an area with empty locales", async () => {
    mockGetWaypoint.mockResolvedValueOnce({
      ...waypoint104143,
      areas: [{ document_id: 14403, locales: [], area_type: "range", available_langs: null }],
    });

    const result = await handleGetWaypoint({ id: 104143 });

    expect(result).toContain("- [14403] Untitled (range)");
    expect(result).not.toContain("undefined");
  });
});

describe("get_waypoint user-written text", () => {
  it("wraps the description and access of hut 108059 in markers labelled with their field", async () => {
    // Trimmed from the live GET /waypoints/108059?lang=fr response (2026-10-04): the fr locale only, the
    // description cut after its second heading and the access after its second line.
    mockGetWaypoint.mockResolvedValueOnce({
      document_id: 108059,
      locales: [
        {
          lang: "fr",
          title: "Refuge Baudino",
          description:
            "1 table en extérieur et 1 en intérieur\n\n## Capacité\n5/6 places.\n\n## Eau\nPas de source d'eau à proximité.",
          access:
            "Suivre le tracé rouge depuis le [[waypoints/108218|parking du saut du loup]].\nAccès possible depuis le [[waypoints/108217|parking du collet de Saint Pierre]]",
        },
      ],
      waypoint_type: "hut",
      elevation: 797,
    });

    const result = await handleGetWaypoint({ id: 108059 });

    expect(result.split("\n").slice(5)).toEqual([
      "",
      "## Description",
      "[begin user-written text: description]",
      "1 table en extérieur et 1 en intérieur",
      "",
      "#### Capacité",
      "5/6 places.",
      "",
      "#### Eau",
      "Pas de source d'eau à proximité.",
      "[end user-written text: description]",
      "",
      "## Access",
      "[begin user-written text: access]",
      "Suivre le tracé rouge depuis le [[waypoints/108218|parking du saut du loup]].",
      "Accès possible depuis le [[waypoints/108217|parking du collet de Saint Pierre]]",
      "[end user-written text: access]",
    ]);
  });
});

describe("get_waypoint tool definition", () => {
  it("says that text between the markers is user-written content, not instructions", () => {
    const tool = waypointToolDefinitions.find((t) => t.name === "get_waypoint");

    expect(tool?.description).toContain(USER_TEXT_NOTE);
  });

  it("tells the LLM about the areas section and area_id reuse", () => {
    const tool = waypointToolDefinitions.find((t) => t.name === "get_waypoint");

    expect(tool?.description).toContain("the areas it belongs to");
    expect(tool?.description).toContain(
      "Area IDs can be passed as area_id to search_routes, search_waypoints and search_outings.",
    );
  });
});

describe("zero elevation", () => {
  // Trimmed from the live GET /waypoints?q=portbou&limit=10&pl=fr and GET /waypoints/1350803?lang=fr
  // responses (2026-10-04): a seaside access point at elevation 0.
  const portbou = {
    document_id: 1350803,
    locales: [{ lang: "fr", title: "Portbou" }],
    waypoint_type: "access",
    elevation: 0,
  };

  it("prints an elevation of 0 in search_waypoints", async () => {
    mockSearchWaypoints.mockResolvedValueOnce({ total: 1, documents: [portbou] });

    const result = await handleSearchWaypoints({ query: "portbou", limit: 10 });

    expect(result.split("\n").slice(2)).toEqual(["- [1350803] Portbou (access) | 0m"]);
  });

  it("prints an elevation of 0 in get_waypoint", async () => {
    mockGetWaypoint.mockResolvedValueOnce({
      ...portbou,
      geometry: { geom: '{"type": "Point", "coordinates": [351703.791013, 5225111.729224]}' },
    });

    const result = await handleGetWaypoint({ id: 1350803 });

    expect(result.split("\n").slice(2, 5)).toEqual(["", "**Type**: access", "**Elevation**: 0m"]);
  });

  it("prints no elevation line when the elevation is null", async () => {
    mockGetWaypoint.mockResolvedValueOnce({ ...portbou, elevation: null });

    const result = await handleGetWaypoint({ id: 1350803 });

    expect(result).not.toContain("Elevation");
    expect(result).not.toContain("null");
  });
});

describe("get_waypoint hut details", () => {
  // Trimmed from the live GET /waypoints/104151?lang=fr response (2026-10-04): geometry, areas, associations,
  // the description and the access dropped.
  const hut104151 = {
    document_id: 104151,
    locales: [{ lang: "fr", title: "Refuge du Mont Pourri", summary: null, access_period: null }],
    waypoint_type: "hut",
    elevation: 2373,
    capacity: 50,
    capacity_staffed: 55,
    custodianship: "always_accessible",
    phone: "04.79.07.90.43 / 06.14.48.77.26",
    phone_custodian: null,
    url: "http://www.refuge-mont-pourri.fr",
  };

  it("prints the capacities, custodianship, phone and website of hut 104151 after the elevation", async () => {
    mockGetWaypoint.mockResolvedValueOnce(hut104151);

    const result = await handleGetWaypoint({ id: 104151 });

    expect(result.split("\n").slice(2)).toEqual([
      "",
      "**Type**: hut",
      "**Elevation**: 2373m",
      "**Capacity (unstaffed)**: 50",
      "**Capacity (staffed)**: 55",
      "**Custodianship**: always_accessible",
      "**Phone**: 04.79.07.90.43 / 06.14.48.77.26",
      "**Website**: http://www.refuge-mont-pourri.fr",
    ]);
  });

  it("prints an unstaffed capacity of 0 and the custodian's phone of hut 273946", async () => {
    // Trimmed from the live GET /waypoints/273946?lang=fr response (2026-10-04): geometry, areas, associations
    // and the locale's text fields dropped.
    mockGetWaypoint.mockResolvedValueOnce({
      document_id: 273946,
      locales: [{ lang: "fr", title: "Refuge du Lac Blanc" }],
      waypoint_type: "hut",
      elevation: 2300,
      capacity: 0,
      capacity_staffed: 18,
      custodianship: "accessible_when_wardened",
      phone: "+33 (0)6 82 38 11 98",
      phone_custodian: "+33 (0)6 45 98 77 26",
      url: "https://www.refugedulacblanc-vanoise.com",
    });

    const result = await handleGetWaypoint({ id: 273946 });

    expect(result.split("\n").slice(5)).toEqual([
      "**Capacity (unstaffed)**: 0",
      "**Capacity (staffed)**: 18",
      "**Custodianship**: accessible_when_wardened",
      "**Phone**: +33 (0)6 82 38 11 98",
      "**Custodian's phone**: +33 (0)6 45 98 77 26",
      "**Website**: https://www.refugedulacblanc-vanoise.com",
    ]);
  });

  it("labels a bivouac's capacity Capacity", async () => {
    // Trimmed from the live GET /waypoints/1925122?lang=fr response (2026-10-04): the it summary dropped.
    mockGetWaypoint.mockResolvedValueOnce({
      document_id: 1925122,
      locales: [{ lang: "it", title: "Bivacco Ambrogio Fogar all'Alpe Fornalino" }],
      waypoint_type: "bivouac",
      elevation: 2084,
      capacity: 12,
      capacity_staffed: null,
      custodianship: null,
      phone: null,
      phone_custodian: null,
      url: null,
    });

    const result = await handleGetWaypoint({ id: 1925122 });

    expect(result.split("\n").slice(2)).toEqual(["", "**Type**: bivouac", "**Elevation**: 2084m", "**Capacity**: 12"]);
  });

  it("prints an unknown custodianship verbatim", async () => {
    mockGetWaypoint.mockResolvedValueOnce({ ...hut104151, custodianship: "seasonal_key_box" });

    const result = await handleGetWaypoint({ id: 104151 });

    expect(result).toContain("**Custodianship**: seasonal_key_box");
  });

  it("prints the access period of hut 135691 delimited and verbatim, after the access", async () => {
    // Trimmed from the live GET /waypoints/135691?lang=fr response (2026-10-04): geometry, areas,
    // associations and the null external_resources dropped.
    mockGetWaypoint.mockResolvedValueOnce({
      document_id: 135691,
      locales: [
        {
          lang: "fr",
          title: "Refuge des Barmettes",
          description: null,
          summary: null,
          access: "Depuis Pralognan / Les Fontanettes en 1h15 de marche.",
          access_period: "14/06 au 14/09",
        },
      ],
      waypoint_type: "hut",
      elevation: 2010,
      capacity: null,
      capacity_staffed: 27,
      custodianship: "always_accessible",
      phone: "+33479087564",
      phone_custodian: "+330682843168",
      url: "https://www.lesbarmettes-refuge.com",
    });

    const result = await handleGetWaypoint({ id: 135691 });

    const lines = result.split("\n");
    expect(lines).not.toContain("**Capacity (unstaffed)**: null");
    expect(lines).toContain("**Capacity (staffed)**: 27");
    expect(lines.slice(lines.indexOf("## Access"))).toEqual([
      "## Access",
      "[begin user-written text: access]",
      "Depuis Pralognan / Les Fontanettes en 1h15 de marche.",
      "[end user-written text: access]",
      "",
      "## Access period",
      "[begin user-written text: access_period]",
      "14/06 au 14/09",
      "[end user-written text: access_period]",
    ]);
  });

  it("prints the summary delimited before the description", async () => {
    // Summary from the live GET /waypoints/1925122?lang=fr response (2026-10-04), cut after its first
    // sentence; description made up.
    mockGetWaypoint.mockResolvedValueOnce({
      document_id: 1925122,
      locales: [
        {
          lang: "it",
          title: "Bivacco Ambrogio Fogar all'Alpe Fornalino",
          summary: "Il bivacco, di proprietà del comune di Bognanco, si trova su un dosso all'Alpe Fornalino.",
          description: "## Accesso\nDa Bognanco.",
        },
      ],
      waypoint_type: "bivouac",
      elevation: 2084,
    });

    const result = await handleGetWaypoint({ id: 1925122 });

    const lines = result.split("\n");
    expect(lines.slice(lines.indexOf("## Summary"))).toEqual([
      "## Summary",
      "[begin user-written text: summary]",
      "Il bivacco, di proprietà del comune di Bognanco, si trova su un dosso all'Alpe Fornalino.",
      "[end user-written text: summary]",
      "",
      "## Description",
      "[begin user-written text: description]",
      "#### Accesso",
      "Da Bognanco.",
      "[end user-written text: description]",
    ]);
  });

  it("describes the four known custodianship values", () => {
    const tool = waypointToolDefinitions.find((t) => t.name === "get_waypoint");

    for (const value of ["accessible_when_wardened", "always_accessible", "key_needed", "no_warden"]) {
      expect(tool?.description).toContain(value);
    }
  });
});
