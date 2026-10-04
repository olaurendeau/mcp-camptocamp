import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleSearchRoutes,
  handleGetRoute,
  searchRoutesSchema,
  routeToolDefinitions,
} from "../../src/tools/routes.js";
import { USER_TEXT_NOTE } from "../../src/tools/text.js";
import type { z } from "zod";
import * as api from "../../src/api/camptocamp.js";
import { routeDetailSchema, routeSearchResponseSchema } from "../../src/api/schemas.js";
import { ROUTE_RATING_SYSTEMS } from "../../src/tools/ratings.js";
import { throughSchema } from "./through-schema.js";
import { BARE_RATING } from "./bare-rating.js";

vi.mock("../../src/api/camptocamp.js");

const mockSearchRoutes = throughSchema(vi.mocked(api.searchRoutes), routeSearchResponseSchema);
const mockGetRoute = throughSchema(vi.mocked(api.getRoute), routeDetailSchema);

beforeEach(() => {
  vi.clearAllMocks();
});

/** Calls the handler as the MCP server does: with input parsed by the tool schema, defaults applied. */
function search(input: z.input<typeof searchRoutesSchema> = {}): Promise<string> {
  return handleSearchRoutes(searchRoutesSchema.parse(input));
}

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

    const result = await search({ query: "Barre des Écrins", limit: 10 });

    expect(result).toContain("Found 2 route(s)");
    expect(result).toContain("[57842] Barre des Écrins : Voie Gamma");
    expect(result).toContain("4102m");
    expect(result).toContain("| Max elevation: 4102m | Global rating: ED | Rock free rating: 6b+");
    expect(result).toContain("[53914] Arête des Cosmiques");
    expect(result).not.toContain("undefined");
  });

  it("returns empty message when no results", async () => {
    mockSearchRoutes.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await search({ query: "xyznotfound", limit: 10 });

    expect(result).toBe('No routes found matching query "xyznotfound".');
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

    const result = await search({ query: "test", limit: 10 });

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

    expect(result.split("\n").slice(0, 2)).toEqual([
      "# Arête des Cosmiques (ID: 42)",
      "**URL**: https://www.camptocamp.org/routes/42",
    ]);
    expect(result).toContain("Arête des Cosmiques");
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

  it("shows the en locale of a route with [it, en] locales, as search_routes does with pl=fr", async () => {
    // Trimmed from the live GET /routes/675555 response (2026-10-04): texts cut to their first line,
    // null fields, title_prefix, summary, maps, areas and geometry left out.
    mockGetRoute.mockResolvedValueOnce({
      document_id: 675555,
      locales: [
        {
          lang: "it",
          title: "Via Ferrata Gamma 2",
          description: "## Attacco\r\nDai **Piani d'Erna 1330m**, prendere il sentiero numero 1.",
          remarks: "E' considerata una delle ferrate più impegnative delle alpi.",
        },
        {
          lang: "en",
          title: "Via ferrata Gamma 2 - al Dente del Resegone",
          description: "Good things about this route ...",
          remarks: '- Could be preceded by climbing the interesting "via ferrata Gamma 1".',
          gear: "- via ferrata kit (see under Remarks for special concerns or modifications).",
        },
      ],
      activities: ["via_ferrata"],
      elevation_min: 1240,
      elevation_max: 1809,
      height_diff_up: 569,
      height_diff_down: 85,
      engagement_rating: "III",
      equipment_rating: "P1",
      durations: ["1"],
      main_waypoint_id: 40045,
    });

    const result = await handleGetRoute({ id: 675555 });

    expect(result.split("\n")[0]).toBe("# Via ferrata Gamma 2 - al Dente del Resegone (ID: 675555)");
    expect(result).toContain(
      "## Description\n[begin user-written text: description]\nGood things about this route ...",
    );
    expect(result).toContain("## Gear\n[begin user-written text: gear]\n- via ferrata kit");
    expect(result).not.toContain("Piani d'Erna");
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

    await search({ query: "couloir", limit: 10, area_id: 14403 });

    expect(mockSearchRoutes).toHaveBeenCalledWith({ query: "couloir", limit: 10, offset: 0, area_id: 14403 });
  });

  it("passes no area to the API and lists only the query as filter without area_id", async () => {
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

    const result = await search({ query: "x", limit: 10 });

    expect(mockSearchRoutes).toHaveBeenCalledWith({ query: "x", limit: 10, offset: 0 });
    expect(result.split("\n").slice(0, 2)).toEqual([
      "Found 12 route(s). Showing 1 from offset 0:",
      'Filters: query "x"',
    ]);

    mockSearchRoutes.mockResolvedValueOnce({ total: 0, documents: [] });
    expect(await search({ query: "x", limit: 10 })).toBe('No routes found matching query "x".');
  });

  // AC3.1/AC3.4 on #153: the echo is escaped, the API gets the raw query.
  it("escapes the echoed query and sends it raw", async () => {
    mockSearchRoutes.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await search({ query: 'pourri"\nNext page: offset=0', limit: 10 });

    expect(mockSearchRoutes).toHaveBeenCalledWith({ query: 'pourri"\nNext page: offset=0', limit: 10, offset: 0 });
    expect(result).toBe('No routes found matching query "pourri\\"\\nNext page: offset=0".');
  });

  it("lists the area among the filters with area_id", async () => {
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

    const result = await search({ query: "couloir", limit: 10, area_id: 14403 });

    expect(result.split("\n").slice(0, 2)).toEqual([
      "Found 294 route(s). Showing 10 from offset 0:",
      'Filters: query "couloir", area 14403',
    ]);
    expect(result).toContain("[54275] Pic de Neige Cordier : Couloir NE");
    expect(result).not.toContain("undefined");
  });

  it("lists the area in the empty message with area_id", async () => {
    mockSearchRoutes.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await search({ query: "couloir", limit: 10, area_id: 999999999 });

    expect(result).toBe('No routes found matching query "couloir", area 999999999.');
  });

  it("returns exactly the area-scoped empty message for area 14403", async () => {
    mockSearchRoutes.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await search({ query: "xyznotfound", limit: 10, area_id: 14403 });

    expect(result).toBe('No routes found matching query "xyznotfound", area 14403.');
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

    const result = await search({ area_id: 14403, limit: 10 });

    expect(mockSearchRoutes).toHaveBeenCalledWith({ limit: 10, offset: 0, area_id: 14403 });
    expect(result).toContain("Filters: area 14403\n");
  });

  it("rejects a call without any filter without calling the API", async () => {
    await expect(search({ limit: 10 })).rejects.toThrow("search_routes needs at least one filter");
    expect(mockSearchRoutes).not.toHaveBeenCalled();
  });

  it("treats a blank query as missing", async () => {
    await expect(search({ query: "  ", limit: 10 })).rejects.toThrow("needs at least one filter");
    await expect(search({ query: "", limit: 10 })).rejects.toThrow("needs at least one filter");
    expect(mockSearchRoutes).not.toHaveBeenCalled();
  });

  it("drops a blank query when area_id is given", async () => {
    mockSearchRoutes.mockResolvedValueOnce({ total: 0, documents: [] });

    await search({ query: "  ", limit: 10, area_id: 14403 });

    expect(mockSearchRoutes).toHaveBeenCalledWith({ limit: 10, offset: 0, area_id: 14403 });
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

// Real GET /routes/53914 (Martine is on the rock, Aiguille Dibona), texts trimmed to their first lines: the live
// API sends null for unset values, and lift_access false. Untyped fields (version, quality, maps…) omitted.
const route53914: api.RouteDetail = {
  document_id: 53914,
  locales: [
    {
      lang: "fr",
      title: "Martine is on the rock",
      description: "## Approche\nDu refuge, contourner la base de l'aiguille pour accéder au versant E.",
      remarks: "* Face E, donc agréable le matin.",
      gear: "- Corde 1×50 m\n- 15 dégaines",
      route_history: "- Ouverture : 1987-1988 - Denis Bancillon, Eric Allène.",
    },
  ],
  activities: ["rock_climbing"],
  elevation_min: 2719,
  elevation_max: 3131,
  height_diff_up: 412,
  height_diff_down: null,
  height_diff_difficulties: 330,
  height_diff_access: 80,
  orientations: ["E"],
  durations: ["1", "2"],
  route_types: ["loop_hut"],
  configuration: ["face"],
  glacier_gear: "crampons_spring",
  lift_access: false,
  global_rating: "TD",
  engagement_rating: "I",
  risk_rating: null,
  equipment_rating: "P1+",
  exposition_rock_rating: null,
  rock_free_rating: "6b+",
  rock_required_rating: "6a",
  aid_rating: null,
  main_waypoint_id: 39006,
  geometry: { geom_detail: null },
  areas: [
    { document_id: 14274, locales: [{ lang: "fr", title: "France" }], area_type: "country", available_langs: null },
    {
      document_id: 14328,
      locales: [
        { lang: "zh", title: "伊泽尔省" },
        { lang: "fr", title: "Isère" },
      ],
      area_type: "admin_limits",
      available_langs: null,
    },
    { document_id: 14403, locales: [{ lang: "fr", title: "Écrins" }], area_type: "range", available_langs: null },
  ],
};

describe("handleGetRoute with the API's null fields", () => {
  it("formats route 53914 with height_diff_down, risk_rating, exposition_rock_rating and aid_rating null, its practical facts, and its description, remarks, gear and route history as user-written text", async () => {
    mockGetRoute.mockResolvedValueOnce(route53914);

    const result = await handleGetRoute({ id: 53914 });

    expect(result).toBe(
      [
        "# Martine is on the rock (ID: 53914)",
        "**URL**: https://www.camptocamp.org/routes/53914",
        "",
        "**Activities**: rock_climbing",
        "**Global rating**: TD",
        "**Engagement**: I",
        "**Equipment**: P1+",
        "**Rock free rating**: 6b+",
        "**Rock required rating**: 6a",
        "**Max elevation**: 3131m",
        "**Min elevation**: 2719m",
        "**Elevation gain**: 412m",
        "**Difficulties height difference**: 330m",
        "**Access height difference**: 80m",
        "**Orientations**: E",
        "**Duration (days)**: 1, 2",
        "**Route types**: loop_hut",
        "**Configuration**: face",
        "**Glacier gear**: crampons_spring",
        "**Lift access**: no",
        "",
        "## Areas",
        "- [14274] France (country)",
        "- [14328] Isère (admin_limits)",
        "- [14403] Écrins (range)",
        "",
        "## Description",
        "[begin user-written text: description]",
        "#### Approche",
        "Du refuge, contourner la base de l'aiguille pour accéder au versant E.",
        "[end user-written text: description]",
        "",
        "## Remarks",
        "[begin user-written text: remarks]",
        "* Face E, donc agréable le matin.",
        "[end user-written text: remarks]",
        "",
        "## Gear",
        "[begin user-written text: gear]",
        "- Corde 1×50 m",
        "- 15 dégaines",
        "[end user-written text: gear]",
        "",
        "## Route history",
        "[begin user-written text: route_history]",
        "- Ouverture : 1987-1988 - Denis Bancillon, Eric Allène.",
        "[end user-written text: route_history]",
      ].join("\n"),
    );
  });
});

describe("summit names", () => {
  it("prints the summit name before the route title in search_routes", async () => {
    // Trimmed from the live GET /routes?q=voie normale&limit=10&pl=fr response (2026-10-04): the first
    // document only, reduced to the typed fields (summary, geometry, areas and untyped ratings left out).
    mockSearchRoutes.mockResolvedValueOnce({
      total: 1213,
      documents: [
        {
          document_id: 430919,
          locales: [{ lang: "fr", title: "Voie normale", title_prefix: "Castell Vidre" }],
          activities: ["rock_climbing"],
          elevation_max: 1629,
          height_diff_difficulties: 80,
          global_rating: "AD+",
          rock_free_rating: "5b",
        },
      ],
    });

    const result = await search({ query: "voie normale", limit: 10 });

    const line = result.split("\n").find((l) => l.startsWith("- [430919]"));
    expect(line?.startsWith("- [430919] Castell Vidre : Voie normale (rock_climbing)")).toBe(true);
  });

  it("prints the route title alone when the summit name is blank", async () => {
    // Route 1678194 as found by the live GET /routes?q=tour du mont pourri&pl=fr (2026-10-04), its
    // title_prefix "" there replaced by "   " to check that a blank summit name is trimmed away too.
    mockSearchRoutes.mockResolvedValueOnce({
      total: 1,
      documents: [
        {
          document_id: 1678194,
          locales: [{ lang: "fr", title: "Tour du Mont Pourri en 5 jours", title_prefix: "   " }],
          activities: ["hiking"],
          elevation_max: 2690,
        },
      ],
    });

    const result = await search({ query: "tour du mont pourri", limit: 50 });

    expect(result.split("\n")).toContain("- [1678194] Tour du Mont Pourri en 5 jours (hiking) | Max elevation: 2690m");
    expect(result).not.toContain("] : ");
    expect(result).not.toContain("]  : ");
  });

  it("prints the summit name in the get_route heading", async () => {
    // Trimmed from the live GET /routes/54085 response (2026-10-04): the fr locale only, its texts cut,
    // and the untyped fields (ratings, orientations, maps, areas, geometry) left out.
    mockGetRoute.mockResolvedValueOnce({
      document_id: 54085,
      locales: [
        {
          lang: "fr",
          title: "Versant W par le Glacier du Geay",
          title_prefix: "Mont Pourri",
          description: "Le Mont Pourri est le second sommet de la Vanoise.",
        },
      ],
      activities: ["skitouring"],
      elevation_min: 2370,
      elevation_max: 3779,
      height_diff_up: 1425,
      height_diff_down: null,
      durations: ["1"],
      main_waypoint_id: 37916,
    });

    const result = await handleGetRoute({ id: 54085 });

    expect(result.split("\n")[0]).toBe("# Mont Pourri : Versant W par le Glacier du Geay (ID: 54085)");
  });
});

describe("rating labels", () => {
  it("labels every rating of a search line by its system and adds the elevation gain", async () => {
    // Trimmed from the live GET /routes?q=voie normale&limit=10&pl=fr response (2026-10-04): three of the ten
    // documents, reduced to the typed fields; the API leaves unset ratings out of list items.
    mockSearchRoutes.mockResolvedValueOnce({
      total: 1213,
      documents: [
        {
          document_id: 430919,
          locales: [{ lang: "fr", title: "Voie normale", title_prefix: "Castell Vidre" }],
          activities: ["rock_climbing"],
          elevation_max: 1629,
          height_diff_up: 150,
          height_diff_difficulties: 80,
          global_rating: "AD+",
          engagement_rating: "I",
          risk_rating: "X1",
          equipment_rating: "P1",
          rock_free_rating: "5b",
          rock_required_rating: "5b",
          exposition_rock_rating: "E1",
          aid_rating: "A0",
        },
        {
          document_id: 55195,
          locales: [{ lang: "fr", title: "Versant SW", title_prefix: "Roccia Nera" }],
          activities: ["skitouring", "snow_ice_mixed"],
          elevation_max: 4075,
          height_diff_up: 650,
          height_diff_difficulties: 650,
          ski_rating: "4.1",
          ski_exposition: "E4",
          global_rating: "F",
          engagement_rating: "II",
        },
        {
          document_id: 54085,
          locales: [{ lang: "fr", title: "Versant W par le Glacier du Geay", title_prefix: "Mont Pourri" }],
          activities: ["skitouring"],
          elevation_max: 3779,
          height_diff_up: 1425,
          height_diff_difficulties: 900,
          ski_rating: "4.1",
          ski_exposition: "E2",
          labande_ski_rating: "S4",
          labande_global_rating: "AD",
        },
      ],
    });

    const result = await search({ query: "voie normale", limit: 10 });

    const lines = result.split("\n");
    const castellVidre = lines.find((l) => l.startsWith("- [430919]"));
    for (const part of ["Rock free rating: 5b", "Rock required rating: 5b", "Rock exposure: E1", "Aid rating: A0"]) {
      expect(castellVidre).toContain(part);
    }
    expect(lines.find((l) => l.startsWith("- [55195]"))).toContain(
      "Ski rating (Toponeige): 4.1 | Ski exposure: E4 | Global rating: F | Engagement: II",
    );
    expect(lines.find((l) => l.startsWith("- [54085]"))).toBe(
      "- [54085] Mont Pourri : Versant W par le Glacier du Geay (skitouring) | Max elevation: 3779m | " +
        "Elevation gain: 1425m | Ski rating (Toponeige): 4.1 | Ski exposure: E2 | Labande: S4 / AD",
    );
    expect(result).not.toMatch(BARE_RATING);
  });

  it("prints every rating of route 54085 in get_route, labelled by system", async () => {
    // Trimmed from the live GET /routes/54085 response (2026-10-04): the fr locale only, without texts; untyped
    // fields (orientations, maps, associations, geometry) left out. The API sends only the ski ratings of this
    // ski route; route 53914 below has unset rock ratings sent as null.
    mockGetRoute.mockResolvedValueOnce({
      document_id: 54085,
      locales: [{ lang: "fr", title: "Versant W par le Glacier du Geay", title_prefix: "Mont Pourri" }],
      activities: ["skitouring"],
      elevation_min: 2370,
      elevation_max: 3779,
      height_diff_up: 1425,
      height_diff_down: null,
      ski_rating: "4.1",
      ski_exposition: "E2",
      labande_ski_rating: "S4",
      labande_global_rating: "AD",
    });

    const result = await handleGetRoute({ id: 54085 });

    const lines = result.split("\n");
    const activities = lines.indexOf("**Activities**: skitouring");
    expect(lines.slice(activities + 1, activities + 4)).toEqual([
      "**Ski rating (Toponeige)**: 4.1",
      "**Ski exposure**: E2",
      "**Labande**: S4 / AD",
    ]);
    expect(lines[activities + 4]).toBe("**Max elevation**: 3779m");
    expect(result).not.toMatch(BARE_RATING);
    expect(result).not.toContain("null");
  });
});

describe("zero values", () => {
  it("prints 0 for the elevations of route 755308 and leaves out its null height differences", async () => {
    // Trimmed from the live GET /routes/755308?lang=fr response (2026-10-04): a deep-water solo at sea
    // level; null ratings, areas and texts left out.
    mockGetRoute.mockResolvedValueOnce({
      document_id: 755308,
      locales: [
        { lang: "es", title: "Canceou", title_prefix: "Le Moulon [Psicobloc]" },
        { lang: "fr", title: "Psicobloc", title_prefix: "Le Moulon [Psicobloc]" },
      ],
      activities: ["rock_climbing"],
      elevation_max: 0,
      elevation_min: 0,
      height_diff_up: null,
      height_diff_down: null,
    });

    const result = await handleGetRoute({ id: 755308 });

    expect(result.split("\n").slice(3)).toEqual([
      "**Activities**: rock_climbing",
      "**Max elevation**: 0m",
      "**Min elevation**: 0m",
    ]);
  });

  it("prints 0 for the height differences of route 1863822 and leaves out its null elevations", async () => {
    // Trimmed from the live GET /routes/1863822?lang=fr response (2026-10-04); areas and texts left out.
    mockGetRoute.mockResolvedValueOnce({
      document_id: 1863822,
      locales: [
        {
          lang: "fr",
          title: "Le coin de bois et les anges passent ",
          title_prefix: "Cap Canaille - Saphira et Grande Bleue",
        },
      ],
      activities: ["rock_climbing"],
      elevation_max: null,
      elevation_min: null,
      height_diff_up: 0,
      height_diff_down: 0,
      global_rating: "ED-",
      equipment_rating: "P4",
      exposition_rock_rating: "E5",
      rock_free_rating: "6c+",
      rock_required_rating: "6b",
      aid_rating: "A2",
    });

    const result = await handleGetRoute({ id: 1863822 });

    const lines = result.split("\n");
    expect(lines.slice(lines.indexOf("**Aid rating**: A2") + 1)).toEqual([
      "**Elevation gain**: 0m",
      "**Elevation loss**: 0m",
    ]);
    expect(result).not.toContain("elevation**");
  });
});

describe("get_route user-written text", () => {
  it("wraps the description of route 54085 in markers and demotes its ## Approche", async () => {
    // Trimmed from the live GET /routes/54085?lang=fr response (2026-10-04): the fr locale only, its
    // description cut after the first headings and its remarks after the first line; gear is null there.
    mockGetRoute.mockResolvedValueOnce({
      document_id: 54085,
      locales: [
        {
          lang: "fr",
          title: "Versant W par le Glacier du Geay",
          title_prefix: "Mont Pourri",
          description:
            "[img=192710 right]Mont Pourri, itinéraire 1[/img]\n\n## Approche\n### Rejoindre le Refuge du Pourri\n- Par les Lanches\n\n## Voie\nRemonter le glacier en son milieu en évitant les zones de séracs.",
          remarks: "- Orientation générale W puis NW.",
          gear: null,
        },
      ],
      activities: ["skitouring"],
      elevation_max: 3779,
    });

    const result = await handleGetRoute({ id: 54085 });

    const lines = result.split("\n");
    const start = lines.indexOf("[begin user-written text: description]");
    expect(lines[start - 1]).toBe("## Description");
    expect(lines.slice(start, start + 10)).toEqual([
      "[begin user-written text: description]",
      "[image: Mont Pourri, itinéraire 1]",
      "",
      "#### Approche",
      "##### Rejoindre le Refuge du Pourri",
      "- Par les Lanches",
      "",
      "#### Voie",
      "Remonter le glacier en son milieu en évitant les zones de séracs.",
      "[end user-written text: description]",
    ]);
    expect(result).toContain("## Remarks\n[begin user-written text: remarks]\n- Orientation générale W puis NW.\n");
    expect(lines).not.toContain("## Approche");
    expect(lines).not.toContain("## Gear");
  });
});

// A skitouring route of a search result, reduced to the typed fields a search line prints.
function skiRoute(
  id: number,
  [title_prefix, title]: [string, string],
  [elevation_max, height_diff_up]: [number, number],
  [ski_rating, ski_exposition, labande_ski_rating, labande_global_rating]: (string | null)[],
) {
  return {
    document_id: id,
    locales: [{ lang: "fr", title, title_prefix }],
    activities: ["skitouring"],
    ...{ elevation_max, height_diff_up, ski_rating, ski_exposition, labande_ski_rating, labande_global_rating },
  };
}

// The live GET /routes?a=14409&act=skitouring&trat=3.1,4.1&hdif=1000,1500&limit=10&pl=fr response (2026-10-04):
// total 54, the ten documents reduced to the fields search lines print.
const vanoiseSkiRoutes = {
  total: 54,
  documents: [
    skiRoute(1944775, ["Croix des Verdons / Dent de Burgin", "Couloir Ouest"], [2650, 1240], ["4.1", "E1", null, "PD"]),
    skiRoute(1618656, ["Roc de Burel", "Couloir S"], [3075, 1425], ["4.1", null, "S4", null]),
    skiRoute(
      1525817,
      ["", "Pointe de Claret et Aiguille de Méan Martin depuis la Femma"],
      [3355, 1500],
      ["3.1", "E1", "S3", "AD-"],
    ),
    // Verbatim: Camptocamp has elevation_min 2558 and elevation_max 1400 for this route (also GET /routes/1512979, 2026-10-04).
    skiRoute(1512979, ["Mont Jovet", "Couloirs N"], [1400, 1200], ["3.3", "E1", "S2", "AD-"]),
    skiRoute(1491351, ["Pointe de la Vélière", "Couloir S (couloir amada)"], [2467, 1100], ["3.3", "E3", "S3", "D"]),
    skiRoute(1406657, ["Aiguille Pers", "Versant NW - Épaule N  "], [3200, 1350], ["3.2", "E2", "S4", "AD"]),
    skiRoute(1313273, ["Grand Roc Noir", "Épaule S par Lanserlia "], [3440, 1330], ["3.1", "E2", "S3", "AD-"]),
    skiRoute(
      1310490,
      ["Col du Borgne", "Traversée S-N en boucle depuis Méribel"],
      [3042, 1400],
      ["3.2", "E1", "S2", "PD-"],
    ),
    skiRoute(
      1300352,
      ["Crête de Côte Chaude", "Franchissement versant NE / pente SW"],
      [3050, 1190],
      ["3.3", null, "S4", "AD+"],
    ),
    skiRoute(1293749, ["Grand Tuf du Plan Séry", "Versant ENE"], [2905, 1500], ["3.1", "E1", "S2", "F+"]),
  ],
};

const EMPTY = { total: 0, documents: [] };

const GLOBAL_SCALE = "F, F+, PD-, PD, PD+, AD-, AD, AD+, D-, D, D+, TD-, TD, TD+, ED-, ED, ED+, ED4, ED5, ED6, ED7";

describe("search_routes filters", () => {
  it("sends every filter of AC4.1 and repeats them in the header", async () => {
    mockSearchRoutes.mockResolvedValueOnce(vanoiseSkiRoutes);

    const result = await search({
      area_id: 14409,
      activity: "skitouring",
      rating_system: "ski_rating",
      rating_min: "3.1",
      rating_max: "4.1",
      height_diff_up_min: 1000,
      height_diff_up_max: 1500,
    });

    expect(mockSearchRoutes).toHaveBeenCalledWith({
      limit: 10,
      offset: 0,
      area_id: 14409,
      activity: "skitouring",
      rating: { system: "ski_rating", min: "3.1", max: "4.1" },
      height_diff_up: { min: 1000, max: 1500 },
    });
    const lines = result.split("\n");
    expect(lines.slice(0, 3)).toEqual([
      "Found 54 route(s). Showing 10 from offset 0:",
      "Filters: area 14409, activity skitouring, ski rating (Toponeige) 3.1 → 4.1, elevation gain 1000 → 1500m",
      "",
    ]);
    expect(lines[3]).toBe(
      "- [1944775] Croix des Verdons / Dent de Burgin : Couloir Ouest (skitouring) | Max elevation: 2650m | " +
        "Elevation gain: 1240m | Ski rating (Toponeige): 4.1 | Ski exposure: E1 | Labande: PD",
    );
    expect(lines.at(-1)).toBe("Next page: offset=10");
  });

  it("sends one-sided ranges and describes them with from / up to", async () => {
    mockSearchRoutes.mockResolvedValueOnce(EMPTY).mockResolvedValueOnce(EMPTY);

    expect(await search({ rating_system: "global_rating", rating_min: "AD", height_diff_up_max: 1500 })).toBe(
      "No routes found matching global rating from AD, elevation gain up to 1500m.",
    );
    expect(mockSearchRoutes).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      rating: { system: "global_rating", min: "AD" },
      height_diff_up: { max: 1500 },
    });

    expect(await search({ rating_system: "hiking_rating", rating_max: "T2", height_diff_up_min: 1000 })).toBe(
      "No routes found matching hiking rating up to T2, elevation gain from 1000m.",
    );
    expect(mockSearchRoutes).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      rating: { system: "hiking_rating", max: "T2" },
      height_diff_up: { min: 1000 },
    });
  });

  it("accepts equal bounds and the ends of a scale", async () => {
    mockSearchRoutes.mockResolvedValueOnce(EMPTY).mockResolvedValueOnce(EMPTY).mockResolvedValueOnce(EMPTY);

    await search({ rating_system: "global_rating", rating_min: "F", rating_max: "ED7" });
    await search({ rating_system: "ski_rating", rating_min: "4.1", rating_max: "4.1" });
    await search({ height_diff_up_min: 1000, height_diff_up_max: 1000 });

    expect(mockSearchRoutes).toHaveBeenCalledTimes(3);
  });

  it.each<[string, z.input<typeof searchRoutesSchema>, string]>([
    [
      "an off-scale rating_min",
      { area_id: 14409, rating_system: "global_rating", rating_min: "XX" },
      `rating_min "XX" is not a valid global_rating value; valid values: ${GLOBAL_SCALE}`,
    ],
    [
      "an off-scale rating_max",
      { area_id: 14409, rating_system: "global_rating", rating_min: "AD", rating_max: "4.1" },
      `rating_max "4.1" is not a valid global_rating value; valid values: ${GLOBAL_SCALE}`,
    ],
    [
      "a value of another system",
      { rating_system: "mtb_down_rating", rating_min: "M1" },
      'rating_min "M1" is not a valid mtb_down_rating value; valid values: V1, V2, V3, V4, V5',
    ],
    [
      "a rating_min with a quote and a line break, quoted on one line",
      { rating_system: "mtb_down_rating", rating_min: 'V1"\nV2' },
      'rating_min "V1\\"\\nV2" is not a valid mtb_down_rating value; valid values: V1, V2, V3, V4, V5',
    ],
    [
      "a rating_max with a control character, quoted on one line",
      { rating_system: "mtb_down_rating", rating_max: "V5\u2028" },
      'rating_max "V5\\u2028" is not a valid mtb_down_rating value; valid values: V1, V2, V3, V4, V5',
    ],
    [
      "reversed rating bounds",
      { rating_system: "ski_rating", rating_min: "4.2", rating_max: "3.1" },
      "rating_min must not be above rating_max",
    ],
    [
      "rating_min without rating_system",
      { area_id: 14409, rating_min: "AD" },
      "rating_min and rating_max need a rating_system",
    ],
    ["rating_max without rating_system", { rating_max: "AD" }, "rating_min and rating_max need a rating_system"],
    [
      "rating_system without bounds",
      { area_id: 14409, rating_system: "global_rating" },
      "rating_system needs rating_min, rating_max or both",
    ],
    [
      "reversed elevation gain bounds",
      { height_diff_up_min: 1500, height_diff_up_max: 1000 },
      "height_diff_up_min must not be above height_diff_up_max",
    ],
    [
      "offset + limit above 10,000",
      { query: "mont blanc", offset: 9995, limit: 10 },
      "offset + limit must not exceed 10000",
    ],
  ])("rejects %s before any request", async (_label, input, message) => {
    await expect(search(input)).rejects.toThrow(message);
    expect(mockSearchRoutes).not.toHaveBeenCalled();
  });

  it("sends configuration and route_types values as given", async () => {
    mockSearchRoutes.mockResolvedValueOnce(EMPTY).mockResolvedValueOnce(EMPTY);

    expect(await search({ area_id: 14409, configuration: ["edge"] })).toBe(
      "No routes found matching area 14409, configuration edge.",
    );
    expect(mockSearchRoutes).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      area_id: 14409,
      configuration: ["edge"],
    });

    expect(await search({ area_id: 14409, configuration: ["edge", "face"], route_types: ["traverse", "loop"] })).toBe(
      "No routes found matching area 14409, route types traverse or loop, configuration edge or face.",
    );
    expect(mockSearchRoutes).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 0,
      area_id: 14409,
      route_types: ["traverse", "loop"],
      configuration: ["edge", "face"],
    });
  });

  it("rejects an unknown configuration or route_types value, listing the valid ones", () => {
    const configuration = searchRoutesSchema.safeParse({ configuration: ["edge", "arete"] });
    expect(configuration.error?.issues).toEqual([
      expect.objectContaining({
        path: ["configuration", 1],
        message: "must be one of: edge, pillar, face, corridor, goulotte, glacier",
      }),
    ]);
    const routeTypes = searchRoutesSchema.safeParse({ route_types: ["one_way"] });
    expect(routeTypes.error?.issues).toEqual([
      expect.objectContaining({
        path: ["route_types", 0],
        message: "must be one of: return_same_way, loop, loop_hut, traverse, raid, expedition",
      }),
    ]);
    expect(searchRoutesSchema.safeParse({ configuration: [] }).success).toBe(false);
    expect(searchRoutesSchema.safeParse({ activity: "skiing" }).success).toBe(false);
    expect(searchRoutesSchema.safeParse({ rating_system: "rating" }).success).toBe(false);
    for (const bound of ["rating_min", "rating_max"]) {
      expect(searchRoutesSchema.safeParse({ [bound]: "M".repeat(9) }).success, bound).toBe(false);
      expect(searchRoutesSchema.safeParse({ [bound]: "M".repeat(8) }).success, bound).toBe(true);
    }
  });

  it("searches the routes of a waypoint for an activity (AC4.5)", async () => {
    mockSearchRoutes.mockResolvedValueOnce(EMPTY);

    expect(await search({ waypoint_id: 37916, activity: "skitouring" })).toBe(
      "No routes found matching waypoint 37916, activity skitouring.",
    );
    expect(mockSearchRoutes).toHaveBeenCalledWith({ limit: 10, offset: 0, waypoint_id: 37916, activity: "skitouring" });
  });

  it("prints route 1678194 of waypoint 37916 without a dangling summit separator (AC1.4)", async () => {
    // Route 1678194 in the live GET /routes?w=37916&limit=50&pl=fr response (2026-10-04): 22 routes, title_prefix "".
    mockSearchRoutes.mockResolvedValueOnce({
      total: 22,
      documents: [
        {
          document_id: 1678194,
          locales: [{ lang: "fr", title: "Tour du Mont Pourri en 5 jours", title_prefix: "" }],
          activities: ["hiking"],
          elevation_max: 2690,
          height_diff_up: 2560,
          hiking_rating: "T2",
          hiking_mtb_exposition: null,
        },
      ],
    });

    const result = await search({ waypoint_id: 37916, limit: 50 });

    expect(result).toContain(
      "\n- [1678194] Tour du Mont Pourri en 5 jours (hiking) | Max elevation: 2690m | Elevation gain: 2560m | " +
        "Hiking rating: T2",
    );
    expect(result).not.toContain("] : ");
    expect(result).not.toContain("]  : ");
  });

  it.each<[string, z.input<typeof searchRoutesSchema>]>([
    ["waypoint_id", { waypoint_id: 37916 }],
    ["activity", { activity: "via_ferrata" }],
    ["a rating", { rating_system: "via_ferrata_rating", rating_min: "K4" }],
    ["height_diff_up_min", { height_diff_up_min: 2000 }],
    ["height_diff_up_max", { height_diff_up_max: 200 }],
    ["route_types", { route_types: ["raid"] }],
    ["configuration", { configuration: ["goulotte"] }],
  ])("accepts %s as the only filter (D5)", async (_label, input) => {
    mockSearchRoutes.mockResolvedValueOnce(EMPTY);

    await search(input);

    expect(mockSearchRoutes).toHaveBeenCalledOnce();
  });

  it("refuses a call without any filter, naming them all", async () => {
    await expect(search({})).rejects.toThrow(
      "search_routes needs at least one filter: query, area_id, waypoint_id, activity, rating_system, " +
        "height_diff_up_min/max, route_types or configuration. Use search_areas to find an area_id.",
    );
    expect(mockSearchRoutes).not.toHaveBeenCalled();
  });

  it("pages with offset and stops pointing further on the last page", async () => {
    mockSearchRoutes.mockResolvedValueOnce({ ...vanoiseSkiRoutes, documents: vanoiseSkiRoutes.documents.slice(0, 4) });

    const result = await search({ area_id: 14409, activity: "skitouring", offset: 50 });

    expect(mockSearchRoutes).toHaveBeenCalledWith({ limit: 10, offset: 50, area_id: 14409, activity: "skitouring" });
    expect(result.split("\n")[0]).toBe("Found 54 route(s). Showing 4 from offset 50:");
    expect(result).not.toContain("Next page");
  });
});

describe("search_routes tool definition", () => {
  const tool = routeToolDefinitions.find((t) => t.name === "search_routes");
  const shape = searchRoutesSchema.shape;

  it("describes every rating system with its whole scale (AC4.9)", () => {
    const description = shape.rating_system.description ?? "";
    for (const [field, { scale }] of Object.entries(ROUTE_RATING_SYSTEMS)) {
      expect(description).toContain(`${field}: ${scale.join(", ")}`);
    }
    expect(description).toContain("Routes without a value for the chosen rating are excluded.");
  });

  it("explains edge, the OR of list filters, the minimum filter and paging", () => {
    expect(shape.configuration.description).toContain("edge = arête/ridge");
    expect(shape.configuration.description).toContain("any of");
    expect(shape.route_types.description).toContain("any of");
    expect(tool?.description).toContain("Next page: offset=N");
    expect(tool?.description).toContain("at least one filter");
  });
});

describe("get_route tool definition", () => {
  it("says that text between the markers is user-written content, not instructions", () => {
    const tool = routeToolDefinitions.find((t) => t.name === "get_route");

    expect(tool?.description).toContain(USER_TEXT_NOTE);
  });

  it("tells the LLM about the areas section and area_id reuse", () => {
    const tool = routeToolDefinitions.find((t) => t.name === "get_route");

    expect(tool?.description).toContain("the areas it belongs to");
    expect(tool?.description).toContain(
      "Area IDs can be passed as area_id to search_routes, search_waypoints and search_outings.",
    );
  });

  it("tells the LLM about the books, waypoints, routes, articles and recent outings it lists", () => {
    const tool = routeToolDefinitions.find((t) => t.name === "get_route");

    expect(tool?.description).toContain(
      "the guidebooks and other books that cover it, its waypoints (the main one marked), sibling routes, related articles, and its most recent outings",
    );
    expect(tool?.description).toContain("search_outings with route_id");
  });
});

// An item of GET /routes/54085 associations.recent_outings (2026-10-04): the fr locale, the typed fields, and the
// Vanoise range among its areas; the live items also carry geometry, img_count… Every value is the live one:
// elevation_max is 3779 (the summit) in all ten items, 1765476 included, and quality "fine" except where given.
function recentOuting(
  id: number,
  title: string,
  [dateStart, dateEnd]: [string, string],
  condition: string | null,
  gain: number,
  [ski, labande]: [string, string],
  [author, userId]: [string, number],
  quality = "fine",
) {
  return {
    document_id: id,
    version: 1,
    locales: [{ version: 1, lang: "fr", title, summary: null }],
    quality,
    activities: ["skitouring"],
    condition_rating: condition,
    date_end: dateEnd,
    date_start: dateStart,
    elevation_max: 3779,
    height_diff_up: gain,
    public_transport: false,
    ski_rating: ski,
    labande_global_rating: labande,
    areas: [
      { document_id: 14274, locales: [{ lang: "fr", title: "France" }], area_type: "country", type: "a" },
      { document_id: 14409, locales: [{ lang: "fr", title: "Vanoise" }], area_type: "range", type: "a" },
    ],
    author: { name: author, user_id: userId },
    type: "o",
  };
}

const GEAY = "Mont Pourri : Versant W par le Glacier du Geay";

// Trimmed from the live GET /routes/54085 response (2026-10-04): the fr locale without texts, the associations
// without their geometry and areas, sibling route 46624 left out; images and xreports kept as the API sends them.
const route54085 = {
  document_id: 54085,
  locales: [{ lang: "fr", title: "Versant W par le Glacier du Geay", title_prefix: "Mont Pourri" }],
  activities: ["skitouring"],
  main_waypoint_id: 37916,
  ski_rating: "4.1",
  associations: {
    waypoints: (
      [
        [37916, "Mont Pourri", "summit", 3779],
        [104151, "Refuge du Mont Pourri", "hut", 2373],
        [104593, "Les Arcs", "access", 2120],
        [104602, "Les Lanches", "access", 1530],
      ] as const
    ).map(([document_id, title, waypoint_type, elevation]) => ({
      document_id,
      version: 6,
      locales: [{ version: 3, lang: "fr", title, summary: null }],
      quality: "great",
      waypoint_type,
      elevation,
      available_langs: ["fr"],
      type: "w",
    })),
    routes: [
      {
        document_id: 55834,
        locales: [
          {
            lang: "fr",
            title: "Versant W - Glacier du Geay → Grand Col (par le Col des Roches)",
            summary: null,
            title_prefix: "Mont Pourri",
          },
        ],
        activities: ["snow_ice_mixed"],
        elevation_max: 3779,
        durations: ["2"],
        global_rating: "PD",
        engagement_rating: "II",
        risk_rating: null,
        equipment_rating: "P1",
        ice_rating: null,
        public_transportation_rating: null,
        type: "r",
      },
    ],
    books: [
      {
        document_id: 14643,
        version: 7,
        locales: [
          { version: 10, lang: "fr", title: "Le topo de la Vanoise -  Tarentaise - Beaufortain", summary: null },
        ],
        quality: "medium",
        author: "James Merel, Philippe Deslandes",
        activities: ["mountain_climbing", "snow_ice_mixed", "rock_climbing"],
        book_types: ["topo"],
        available_langs: ["fr"],
        type: "b",
      },
      {
        document_id: 472409,
        version: 2,
        locales: [{ version: 1, lang: "fr", title: "Montagnes Magazine #396", summary: null }],
        quality: "medium",
        author: null,
        activities: ["skitouring", "ice_climbing"],
        book_types: ["magazine"],
        available_langs: ["fr"],
        type: "b",
      },
    ],
    articles: [],
    images: [],
    xreports: [],
    recent_outings: {
      total: 64,
      documents: [
        recentOuting(1900552, GEAY, ["2026-04-26", "2026-04-26"], "good", 1425, ["4.1", "AD"], ["krok", 1573563]),
        recentOuting(
          1900761,
          GEAY,
          ["2026-04-26", "2026-04-26"],
          "excellent",
          1425,
          ["4.1", "AD"],
          ["Strap98", 1892731],
        ),
        recentOuting(
          1895600,
          "Mont Pourri : Versant W - Grand Col → Col des Roches → Glacier du Geay",
          ["2026-04-15", "2026-04-15"],
          "good",
          2000,
          ["3.3", "AD+"],
          ["lagopède", 455914],
        ),
        recentOuting(1880674, GEAY, ["2026-03-07", "2026-03-08"], "good", 1600, ["4.1", "AD"], ["MarionO", 466185]),
        recentOuting(1871490, GEAY, ["2026-02-07", "2026-02-08"], "good", 1900, ["4.1", "AD"], ["Apoutsiak", 1297]),
        recentOuting(
          1765476,
          "Mont pourri pas le glacier du Geay, face N du mont Turia et retour par le grand col",
          ["2025-05-01", "2025-05-02"],
          "good",
          2200,
          ["5.1", "TD-"],
          ["Brossollet", 1363331],
        ),
        recentOuting(1758144, GEAY, ["2025-04-10", "2025-04-10"], "good", 1425, ["4.1", "AD"], ["HugoFS", 1547657]),
        recentOuting(1654405, GEAY, ["2024-06-13", "2024-06-13"], null, 1425, ["4.1", "AD"], ["maxb", 769107], "empty"),
        recentOuting(1637100, GEAY, ["2024-04-14", "2024-04-14"], "good", 1425, ["4.1", "AD"], ["Tmaitre", 1553329]),
        recentOuting(
          1469382,
          GEAY,
          ["2022-03-15", "2022-03-16"],
          null,
          1425,
          ["4.1", "AD"],
          ["Aude.leglise", 1469329],
          "empty",
        ),
      ],
    },
  },
};

// The lines under a heading, up to the next blank line or the end of the output.
function section(result: string, heading: string): string[] {
  const lines = result.split("\n");
  const start = lines.indexOf(heading);
  if (start === -1) return [];
  const end = lines.findIndex((line, i) => i > start && line === "");
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

describe("get_route associations", () => {
  it("lists the books of route 54085, title verbatim, without Author when it is null", async () => {
    mockGetRoute.mockResolvedValueOnce(route54085);

    const books = section(await handleGetRoute({ id: 54085 }), "## Associated books");

    expect(books).toEqual([
      "- [14643] Le topo de la Vanoise -  Tarentaise - Beaufortain | Author: James Merel, Philippe Deslandes | " +
        "Types: topo | Activities: mountain_climbing, snow_ice_mixed, rock_climbing",
      "- [472409] Montagnes Magazine #396 | Types: magazine | Activities: skitouring, ice_climbing",
    ]);
  });

  it("lists the waypoints of route 54085 and marks only its main waypoint", async () => {
    mockGetRoute.mockResolvedValueOnce(route54085);

    const waypoints = section(await handleGetRoute({ id: 54085 }), "## Associated waypoints");

    expect(waypoints).toEqual([
      "- [37916] Mont Pourri (summit) | 3779m | main waypoint",
      "- [104151] Refuge du Mont Pourri (hut) | 2373m",
      "- [104593] Les Arcs (access) | 2120m",
      "- [104602] Les Lanches (access) | 1530m",
    ]);
  });

  it("lists the sibling routes of route 54085 with their summit name and ratings", async () => {
    mockGetRoute.mockResolvedValueOnce(route54085);

    const routes = section(await handleGetRoute({ id: 54085 }), "## Associated routes");

    expect(routes).toEqual([
      "- [55834] Mont Pourri : Versant W - Glacier du Geay → Grand Col (par le Col des Roches) | Global rating: PD | " +
        "Engagement: II | Equipment: P1",
    ]);
  });

  it("lists the 10 recent outings of 64 in search_outings format and says where to find more", async () => {
    mockGetRoute.mockResolvedValueOnce(route54085);

    const result = await handleGetRoute({ id: 54085 });
    const outings = section(result, "## Recent outings (10 of 64)");

    expect(outings).toHaveLength(11);
    expect(outings[0]).toBe(
      `- [1900552] ${GEAY} (skitouring) | 2026-04-26 | Conditions: good | Max elevation: 3779m | ` +
        "Elevation gain: 1425m | Ski rating (Toponeige): 4.1 | Labande: AD | Areas: Vanoise [14409] | Author: krok",
    );
    expect(outings[9]).toBe(
      `- [1469382] ${GEAY} (skitouring) | 2022-03-15 → 2022-03-16 | Max elevation: 3779m | ` +
        "Elevation gain: 1425m | Ski rating (Toponeige): 4.1 | Labande: AD | Areas: Vanoise [14409] | " +
        "Author: Aude.leglise",
    );
    expect(result.endsWith("\nMore: search_outings with route_id=54085")).toBe(true);
  });

  it("prints the association sections after the areas, in a fixed order, and no articles section for 54085", async () => {
    mockGetRoute.mockResolvedValueOnce(route54085);

    const result = await handleGetRoute({ id: 54085 });

    const headings = result.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toEqual([
      "## Associated waypoints",
      "## Associated routes",
      "## Associated books",
      "## Recent outings (10 of 64)",
    ]);
    expect(result).not.toContain("null");
    expect(result).not.toContain("undefined");
  });

  // AC4.1–AC4.3 on #153: one malformed item no longer turns get_route into "unexpected response".
  it("keeps the ratings and description of route 54085 when its hut has waypoint_type null", async () => {
    const [summit, hut, ...access] = route54085.associations.waypoints;
    mockGetRoute.mockResolvedValueOnce({
      ...route54085,
      locales: [{ ...route54085.locales[0], description: "Montée par le glacier du Geay." }],
      associations: { ...route54085.associations, waypoints: [summit, { ...hut, waypoint_type: null }, ...access] },
    } as never);

    const result = await handleGetRoute({ id: 54085 });

    expect(result).toContain("**Ski rating (Toponeige)**: 4.1");
    expect(result).toContain("Montée par le glacier du Geay.");
    expect(section(result, "## Associated waypoints")).toEqual([
      "- [37916] Mont Pourri (summit) | 3779m | main waypoint",
      "- [104151] (not shown: Camptocamp sent this item in an unexpected format)",
      "- [104593] Les Arcs (access) | 2120m",
      "- [104602] Les Lanches (access) | 1530m",
    ]);
  });

  // Review of #188: the placeholder of a malformed main waypoint keeps the "main waypoint" marker.
  it("keeps the main waypoint marker on the placeholder line of a malformed main waypoint", async () => {
    const [summit, ...others] = route54085.associations.waypoints;
    mockGetRoute.mockResolvedValueOnce({
      ...route54085,
      associations: { ...route54085.associations, waypoints: [{ ...summit, waypoint_type: null }, ...others] },
    } as never);

    expect(section(await handleGetRoute({ id: 54085 }), "## Associated waypoints")).toEqual([
      "- [37916] (not shown: Camptocamp sent this item in an unexpected format) | main waypoint",
      "- [104151] Refuge du Mont Pourri (hut) | 2373m",
      "- [104593] Les Arcs (access) | 2120m",
      "- [104602] Les Lanches (access) | 1530m",
    ]);
  });

  it("marks no placeholder without a readable ID as the main waypoint of a route without one", async () => {
    const { waypoints } = route54085.associations;
    mockGetRoute.mockResolvedValueOnce({
      ...route54085,
      main_waypoint_id: undefined,
      associations: { ...route54085.associations, waypoints: [{ ...waypoints[0], document_id: "37916" }] },
    } as never);

    expect(section(await handleGetRoute({ id: 54085 }), "## Associated waypoints")).toEqual([
      "- (not shown: Camptocamp sent an item in an unexpected format)",
    ]);
  });

  it("prints a placeholder line in every list of get_route, without the ID when it is unreadable", async () => {
    const { routes, books, recent_outings } = route54085.associations;
    const [firstOuting, ...outings] = recent_outings.documents;
    mockGetRoute.mockResolvedValueOnce({
      ...route54085,
      areas: [{ document_id: 14409, locales: [{ lang: "fr", title: "Vanoise" }], area_type: null }],
      associations: {
        ...route54085.associations,
        routes: [{ ...routes[0], document_id: "55834" }],
        books: [books[0], { ...books[1], locales: null }],
        articles: [{ document_id: 405598, locales: [{ lang: "fr", title: null }] }],
        recent_outings: { total: 64, documents: [{ ...firstOuting, activities: null }, ...outings] },
      },
    } as never);

    const result = await handleGetRoute({ id: 54085 });

    expect(section(result, "## Areas")).toEqual([
      "- [14409] (not shown: Camptocamp sent this item in an unexpected format)",
    ]);
    expect(section(result, "## Associated routes")).toEqual([
      "- (not shown: Camptocamp sent an item in an unexpected format)",
    ]);
    expect(section(result, "## Associated books")[1]).toBe(
      "- [472409] (not shown: Camptocamp sent this item in an unexpected format)",
    );
    expect(section(result, "## Associated articles")).toEqual([
      "- [405598] (not shown: Camptocamp sent this item in an unexpected format)",
    ]);
    const recent = section(result, "## Recent outings (10 of 64)");
    expect(recent[0]).toBe("- [1900552] (not shown: Camptocamp sent this item in an unexpected format)");
    expect(recent).toHaveLength(11);
  });

  // Trimmed from the live GET /routes/944120 response (2026-10-04): a route with articles but no book,
  // sibling route or outing, and a virtual waypoint at elevation 0.
  const route944120 = {
    document_id: 944120,
    locales: [{ lang: "fr", title: "La dura dura", title_prefix: "Oliana" }],
    activities: ["rock_climbing"],
    main_waypoint_id: 189454,
    associations: {
      articles: [
        {
          document_id: 405598,
          locales: [
            { lang: "it", title: "Aperture 2013", summary: null },
            { lang: "fr", title: "Chroniques - Ouvertures 2013", summary: null },
          ],
          categories: ["topoguide_supplements", "tags"],
          article_type: "collab",
          type: "c",
        },
        {
          document_id: 947724,
          locales: [{ lang: "fr", title: "Les voies 9b et au-delà", summary: "Historique des voies de 9b." }],
          categories: ["topoguide_supplements"],
          article_type: "collab",
          type: "c",
        },
      ],
      books: [],
      routes: [],
      waypoints: [
        {
          document_id: 189454,
          locales: [{ lang: "fr", title: "Oliana" }],
          waypoint_type: "climbing_outdoor",
          elevation: 500,
        },
        {
          document_id: 1947492,
          locales: [
            { lang: "en", title: "First Ascents in 2013" },
            { lang: "fr", title: "Ouvertures 2013" },
          ],
          waypoint_type: "virtual",
          elevation: 0,
        },
      ],
      recent_outings: { documents: [], total: 0 },
    },
  };

  it("lists the articles of route 944120 and leaves out its empty books, routes and recent outings", async () => {
    mockGetRoute.mockResolvedValueOnce(route944120);

    const result = await handleGetRoute({ id: 944120 });

    expect(section(result, "## Associated articles")).toEqual([
      "- [405598] Chroniques - Ouvertures 2013",
      "- [947724] Les voies 9b et au-delà",
    ]);
    expect(section(result, "## Associated waypoints")).toEqual([
      "- [189454] Oliana (climbing_outdoor) | 500m | main waypoint",
      "- [1947492] Ouvertures 2013 (virtual)",
    ]);
    expect(result).not.toContain("## Associated books");
    expect(result).not.toContain("## Associated routes");
    expect(result).not.toContain("## Recent outings");
  });

  it("prints no elevation for a virtual waypoint, even a non-zero one", async () => {
    // Derived: the 944120 fixture with the virtual waypoint's placeholder elevation set to 7999.
    const [oliana, virtual] = route944120.associations.waypoints;
    mockGetRoute.mockResolvedValueOnce({
      ...route944120,
      associations: { ...route944120.associations, waypoints: [oliana, { ...virtual, elevation: 7999 }] },
    });

    const result = await handleGetRoute({ id: 944120 });

    expect(section(result, "## Associated waypoints")).toEqual([
      "- [189454] Oliana (climbing_outdoor) | 500m | main waypoint",
      "- [1947492] Ouvertures 2013 (virtual)",
    ]);
    expect(result).not.toContain("7999m");
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["null lists", { waypoints: null, routes: null, books: null, articles: null, recent_outings: null }],
  ])("prints no association section when associations are %s", async (_label, associations) => {
    mockGetRoute.mockResolvedValueOnce({
      document_id: 99,
      locales: [{ lang: "fr", title: "Simple route" }],
      activities: ["hiking"],
      main_waypoint_id: null,
      associations,
    });

    const result = await handleGetRoute({ id: 99 });

    expect(result).not.toContain("## ");
    expect(result).not.toContain("main waypoint");
  });
});

// Trimmed from the live GET /routes/54085 response (2026-10-04): the scalar fields as sent (calculated_duration,
// public_transportation_rating, route_length and available_langs left out), the fr locale with its description and
// remarks cut to their first line and one of its two external resources, its two areas; no associations.
const route54085Facts = {
  document_id: 54085,
  version: 6,
  locales: [
    {
      version: 29,
      lang: "fr",
      title: "Versant W par le Glacier du Geay",
      title_prefix: "Mont Pourri",
      summary:
        "Le Mont Pourri est le second sommet de la Vanoise et comporte un système glaciaire important. C'est une " +
        "montagne cristalline (micaschiste grenu) massive offrant de nombreuses voies. La voie du glacier du Geay est " +
        "la plus classique. À faire plutôt en début de saison, le glacier étant souvent très crevassé.",
      description: "## Approche",
      slope: "40°",
      remarks: "- Orientation générale W puis NW.",
      gear: null,
      route_history:
        "- Premier parcours de la partie du [[routes/54080/fr|Col des Roches]] au sommet : 4 octobre 1860 - Michel " +
        "Croz. \n- Premier parcours intégral (à la descente) : 8 août 1878 - Christian Almer père et fils, William " +
        "Auguste Coolidge.",
      external_resources:
        "- *Mont Pourri*, [*La Montagne*, 1933, n<sup>o</sup>253, p.356](https://gallica.bnf.fr/ark:/12148/" +
        "bpt6k9764822r/f446.image) : note sur des ascensions printanières en 1933.",
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
  height_diff_access: null,
  height_diff_difficulties: 900,
  route_types: ["return_same_way"],
  orientations: ["NW"],
  glacier_gear: "glacier_safety_gear",
  configuration: ["glacier"],
  lift_access: true,
  ski_rating: "4.1",
  ski_exposition: "E2",
  labande_ski_rating: "S4",
  labande_global_rating: "AD",
  areas: [
    { document_id: 14274, locales: [{ lang: "fr", title: "France" }], area_type: "country" },
    { document_id: 14409, locales: [{ lang: "fr", title: "Vanoise" }], area_type: "range" },
  ],
  protected: false,
  type: "r",
};

describe("get_route practical facts", () => {
  it("prints the facts of route 54085 verbatim after its elevations, then every free-text field delimited, in order", async () => {
    mockGetRoute.mockResolvedValueOnce(route54085Facts);

    const result = await handleGetRoute({ id: 54085 });

    expect(result).toBe(
      [
        "# Mont Pourri : Versant W par le Glacier du Geay (ID: 54085)",
        "**URL**: https://www.camptocamp.org/routes/54085",
        "",
        "**Activities**: skitouring",
        "**Ski rating (Toponeige)**: 4.1",
        "**Ski exposure**: E2",
        "**Labande**: S4 / AD",
        "**Max elevation**: 3779m",
        "**Min elevation**: 2370m",
        "**Elevation gain**: 1425m",
        "**Difficulties height difference**: 900m",
        "**Orientations**: NW",
        "**Duration (days)**: 1",
        "**Route types**: return_same_way",
        "**Configuration**: glacier",
        "**Glacier gear**: glacier_safety_gear",
        "**Lift access**: yes",
        "",
        "## Areas",
        "- [14274] France (country)",
        "- [14409] Vanoise (range)",
        "",
        "## Summary",
        "[begin user-written text: summary]",
        route54085Facts.locales[0].summary,
        "[end user-written text: summary]",
        "",
        "## Description",
        "[begin user-written text: description]",
        "#### Approche",
        "[end user-written text: description]",
        "",
        "## Slope",
        "[begin user-written text: slope]",
        "40°",
        "[end user-written text: slope]",
        "",
        "## Remarks",
        "[begin user-written text: remarks]",
        "- Orientation générale W puis NW.",
        "[end user-written text: remarks]",
        "",
        "## Route history",
        "[begin user-written text: route_history]",
        "- Premier parcours de la partie du Col des Roches (routes/54080) au sommet : 4 octobre 1860 - Michel Croz. ",
        "- Premier parcours intégral (à la descente) : 8 août 1878 - Christian Almer père et fils, William Auguste " +
          "Coolidge.",
        "[end user-written text: route_history]",
        "",
        "## External resources",
        "[begin user-written text: external_resources]",
        "- *Mont Pourri*, [*La Montagne*, 1933, n<sup>o</sup>253, p.356](https://gallica.bnf.fr/ark:/12148/" +
          "bpt6k9764822r/f446.image) : note sur des ascensions printanières en 1933.",
        "[end user-written text: external_resources]",
      ].join("\n"),
    );
  });

  it("prints the access height difference, and lift_access false as no", async () => {
    mockGetRoute.mockResolvedValueOnce({ ...route54085Facts, height_diff_access: 300, lift_access: false });

    const result = await handleGetRoute({ id: 54085 });

    expect(result).toContain(
      "**Difficulties height difference**: 900m\n**Access height difference**: 300m\n**Orientations**: NW\n",
    );
    expect(result).toContain("**Glacier gear**: glacier_safety_gear\n**Lift access**: no\n");
  });

  it('prints glacier_gear "no" verbatim, as a value and not as a missing field', async () => {
    mockGetRoute.mockResolvedValueOnce({ ...route54085Facts, glacier_gear: "no" });

    const result = await handleGetRoute({ id: 54085 });

    expect(result).toContain("**Configuration**: glacier\n**Glacier gear**: no\n**Lift access**: yes\n");
  });

  it("prints 0 height differences, and lists comma-separated and verbatim", async () => {
    mockGetRoute.mockResolvedValueOnce({
      ...route54085Facts,
      height_diff_difficulties: 0,
      height_diff_access: 0,
      orientations: ["N", "NE", "E"],
      durations: ["1", "2"],
      route_types: ["loop", "traverse"],
      configuration: ["edge", "face"],
      glacier_gear: "crampons_req",
    });

    const result = await handleGetRoute({ id: 54085 });

    expect(result).toContain(
      [
        "**Difficulties height difference**: 0m",
        "**Access height difference**: 0m",
        "**Orientations**: N, NE, E",
        "**Duration (days)**: 1, 2",
        "**Route types**: loop, traverse",
        "**Configuration**: edge, face",
        "**Glacier gear**: crampons_req",
      ].join("\n"),
    );
  });

  it.each([
    ["null", null],
    ["missing", undefined],
  ])("prints no fact line and no new text section when the fields are %s", async (_label, value) => {
    mockGetRoute.mockResolvedValueOnce({
      document_id: 54085,
      locales: [
        {
          lang: "fr",
          title: "Versant W par le Glacier du Geay",
          summary: value,
          slope: value,
          route_history: value,
          external_resources: value,
        },
      ],
      activities: ["skitouring"],
      height_diff_difficulties: value,
      height_diff_access: value,
      orientations: value,
      durations: value,
      route_types: value,
      configuration: value,
      glacier_gear: value,
      lift_access: value,
    });

    const result = await handleGetRoute({ id: 54085 });

    expect(result).toBe(
      [
        "# Versant W par le Glacier du Geay (ID: 54085)",
        "**URL**: https://www.camptocamp.org/routes/54085",
        "",
        "**Activities**: skitouring",
      ].join("\n"),
    );
  });

  it("prints no fact line for empty lists", async () => {
    mockGetRoute.mockResolvedValueOnce({
      ...route54085Facts,
      orientations: [],
      durations: [],
      route_types: [],
      configuration: [],
    });

    const result = await handleGetRoute({ id: 54085 });

    for (const label of ["Orientations", "Duration (days)", "Route types", "Configuration"]) {
      expect(result).not.toContain(`**${label}**`);
    }
  });

  it("tells the LLM about the practical facts and the new text sections", () => {
    const tool = routeToolDefinitions.find((t) => t.name === "get_route");

    expect(tool?.description).toContain(
      "orientations, duration in days, route types, configuration, glacier gear, difficulties and access height " +
        "differences, lift access",
    );
    expect(tool?.description).toContain(
      "its summary, description, slope, remarks, gear, route history and external resources",
    );
  });
});
