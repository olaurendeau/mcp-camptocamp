import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleSearchAreas,
  handleGetArea,
  searchAreasSchema,
  getAreaSchema,
  areaToolDefinitions,
} from "../../src/tools/areas.js";
import { USER_TEXT_NOTE } from "../../src/tools/text.js";
import * as api from "../../src/api/camptocamp.js";
import type { AreaDetail, AreaSearchResult } from "../../src/api/camptocamp.js";
import { areaDetailSchema, areaSearchResponseSchema } from "../../src/api/schemas.js";
import { throughSchema } from "./through-schema.js";

vi.mock("../../src/api/camptocamp.js");

const mockSearchAreas = throughSchema(vi.mocked(api.searchAreas), areaSearchResponseSchema);
const mockGetArea = throughSchema(vi.mocked(api.getArea), areaDetailSchema);

beforeEach(() => {
  vi.clearAllMocks();
});

// Mirrors GET /areas?q=valais&limit=10&lang=fr (2026-10-03), trimmed to the fields the tool reads.
const ecrins: AreaSearchResult = {
  document_id: 14403,
  area_type: "range",
  locales: [{ lang: "fr", title: "Écrins" }],
  available_langs: ["fr"],
};

const valaisCanton: AreaSearchResult = {
  document_id: 14384,
  area_type: "admin_limits",
  locales: [
    { lang: "zh", title: "瓦莱州" },
    { lang: "fr", title: "Valais" },
    { lang: "de", title: "Wallis" },
    { lang: "it", title: "Vallese" },
  ],
  available_langs: ["zh", "fr", "de", "it"],
};

const valaisEast: AreaSearchResult = {
  document_id: 14436,
  area_type: "range",
  locales: [
    { lang: "sl", title: " Peninske Alpe vzhod" },
    { lang: "de", title: "Walliser Alpen E - Penninische Alpen E" },
    { lang: "en", title: "Valais E - Pennine Alps E" },
    { lang: "fr", title: "Valais E - Alpes Pennines E" },
    { lang: "it", title: "Alpi Pennine Orientali" },
  ],
  available_langs: ["sl", "de", "en", "fr", "it"],
};

const malaysia: AreaSearchResult = {
  document_id: 14154,
  area_type: "country",
  locales: [
    { lang: "zh", title: "马来西亚" },
    { lang: "en", title: "Malaysia" },
    { lang: "fr", title: "Malaisie" },
  ],
  available_langs: ["zh", "en", "fr"],
};

const ecrinsSummary =
  "Le massif des Écrins est un grand massif montagneux des Alpes françaises situé dans les Hautes-Alpes et en Isère. Il abrite d'importants glaciers, tant en nombre qu'en taille.";

const ecrinsDescription =
  "[img=254125 big no_legend no_border center]Le massif des Écrins depuis la Maurienne[/img]\n\n[toc]\n\n## Situation\nL'Oisans (bassin de la Romanche) au NW, le Champsaur (haut-bassin du Drac) au SW, et le Briançonnais (bassin de la Guisane) au NE recouvrent une partie du massif.\n\nIl est également entouré par les massifs des [[areas/14407|Grandes Rousses]] et du [[areas/14432|Queyras]] à l'E.";

// Mirrors GET /areas/14403?lang=fr (2026-10-03): fr-only locale, geom null, large geom_detail polygon.
const ecrinsDetail: AreaDetail = {
  document_id: 14403,
  area_type: "range",
  locales: [{ lang: "fr", title: "Écrins", summary: ecrinsSummary, description: ecrinsDescription }],
  geometry: {
    geom: null,
    geom_detail:
      '{"type": "Polygon", "coordinates": [[[645731.6614793761, 5602179.434310868], [646203.5216073818, 5602091.363207605], [648782.4462762004, 5599611.567146262], [645731.6614793761, 5602179.434310868]]]}',
  },
};

// Mirrors GET /areas/14361?lang=fr (2026-10-03): fr is the seventh locale, summary and description null.
const hautesAlpesDetail: AreaDetail = {
  document_id: 14361,
  area_type: "admin_limits",
  locales: [
    { lang: "zh", title: "上阿尔卑斯省", summary: null, description: null },
    { lang: "ca", title: "Alts Alps", summary: null, description: null },
    { lang: "de", title: "Hautes-Alpes", summary: null, description: null },
    { lang: "en", title: "Hautes-Alpes", summary: null, description: null },
    { lang: "es", title: "Altos Alpes", summary: null, description: null },
    { lang: "eu", title: "Alpe Garaiak", summary: null, description: null },
    { lang: "fr", title: "Hautes-Alpes", summary: null, description: null },
    { lang: "it", title: "Alte Alpi", summary: null, description: null },
  ],
  geometry: { geom: null, geom_detail: null },
};

describe("handleSearchAreas", () => {
  it("forwards query, limit and area_type to the API", async () => {
    mockSearchAreas.mockResolvedValueOnce({ total: 0, documents: [] });

    await handleSearchAreas({ query: "valais", limit: 20, area_type: "range" });

    expect(mockSearchAreas).toHaveBeenCalledWith({ query: "valais", limit: 20, area_type: "range" });
  });

  it("sends no area type when area_type is absent", async () => {
    mockSearchAreas.mockResolvedValueOnce({ total: 0, documents: [] });

    await handleSearchAreas({ query: "ecrins", limit: 10 });

    expect(mockSearchAreas).toHaveBeenCalledTimes(1);
    expect(mockSearchAreas.mock.calls[0]).toEqual([{ query: "ecrins", limit: 10 }]);
  });

  it("formats the header and one line per area", async () => {
    mockSearchAreas.mockResolvedValueOnce({ total: 5, documents: [ecrins, valaisCanton, malaysia] });

    const result = await handleSearchAreas({ query: "e", limit: 3 });

    expect(result).toContain("Found 5 area(s). Showing 3:");
    expect(result).toContain("- [14403] Écrins (range)");
    expect(result.split("\n").filter((l) => l.startsWith("- ["))).toEqual([
      "- [14403] Écrins (range)",
      "- [14384] Valais (admin_limits)",
      "- [14154] Malaisie (country)",
    ]);
  });

  it("prints area_type verbatim and never translates it", async () => {
    mockSearchAreas.mockResolvedValueOnce({ total: 3, documents: [ecrins, valaisCanton, malaysia] });

    const result = await handleSearchAreas({ query: "a", limit: 10 });

    expect(result).toContain("(admin_limits)");
    expect(result).toContain("(country)");
    expect(result).not.toContain("massif");
    expect(result).not.toContain("département");
  });

  it("returns exactly 'No areas found.' on an empty result", async () => {
    mockSearchAreas.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await handleSearchAreas({ query: "chamonix", limit: 10 });

    expect(result).toBe("No areas found.");
  });

  it("uses the fr title even when another locale comes first", async () => {
    mockSearchAreas.mockResolvedValueOnce({ total: 1, documents: [valaisEast] });

    const result = await handleSearchAreas({ query: "valais", limit: 10, area_type: "range" });

    expect(result).toContain("- [14436] Valais E - Alpes Pennines E (range)");
  });

  it("falls back to the first locale, then to Untitled", async () => {
    mockSearchAreas.mockResolvedValueOnce({
      total: 2,
      documents: [
        { document_id: 280012, area_type: "admin_limits", locales: [{ lang: "en", title: "Isernia" }] },
        { document_id: 999, area_type: "range", locales: [] },
      ],
    });

    const result = await handleSearchAreas({ query: "x", limit: 10 });

    expect(result).toContain("- [280012] Isernia (admin_limits)");
    expect(result).toContain("- [999] Untitled (range)");
    expect(result).not.toContain("undefined");
  });

  it("propagates API errors", async () => {
    mockSearchAreas.mockRejectedValueOnce(new Error("Camptocamp API error: 500 Internal Server Error"));

    await expect(handleSearchAreas({ query: "ecrins", limit: 10 })).rejects.toThrow("Camptocamp API error: 500");
  });
});

describe("handleGetArea", () => {
  it("formats title, type, and the summary and description as user-written text", async () => {
    mockGetArea.mockResolvedValueOnce(ecrinsDetail);

    const result = await handleGetArea({ id: 14403 });

    expect(mockGetArea).toHaveBeenCalledWith(14403);
    expect(result.split("\n").slice(0, 2)).toEqual([
      "# Écrins (ID: 14403)",
      "**URL**: https://www.camptocamp.org/areas/14403",
    ]);
    expect(result.split("\n").slice(2)).toEqual([
      "",
      "**Type**: range",
      "",
      "## Summary",
      "[begin user-written text: summary]",
      ecrinsSummary,
      "[end user-written text: summary]",
      "",
      "## Description",
      "[begin user-written text: description]",
      "[image: Le massif des Écrins depuis la Maurienne]",
      "",
      "[toc]",
      "",
      "#### Situation",
      "L'Oisans (bassin de la Romanche) au NW, le Champsaur (haut-bassin du Drac) au SW, et le Briançonnais (bassin de la Guisane) au NE recouvrent une partie du massif.",
      "",
      "Il est également entouré par les massifs des Grandes Rousses (areas/14407) et du Queyras (areas/14432) à l'E.",
      "[end user-written text: description]",
    ]);
  });

  it("omits null sections and falls back to the fr locale wherever it is", async () => {
    mockGetArea.mockResolvedValueOnce(hautesAlpesDetail);

    const result = await handleGetArea({ id: 14361 });

    expect(result).toContain("# Hautes-Alpes (ID: 14361)");
    expect(result).toContain("**Type**: admin_limits");
    expect(result).not.toContain("## Summary");
    expect(result).not.toContain("## Description");
    expect(result).not.toContain("null");
    expect(result).not.toContain("undefined");
  });

  it("falls back to the first locale, then to Untitled", async () => {
    mockGetArea.mockResolvedValueOnce({
      document_id: 1,
      area_type: "range",
      locales: [{ lang: "en", title: "Somewhere" }],
    });
    mockGetArea.mockResolvedValueOnce({ document_id: 2, area_type: "country", locales: [] });

    const first = await handleGetArea({ id: 1 });
    const second = await handleGetArea({ id: 2 });

    expect(first).toContain("# Somewhere (ID: 1)");
    expect(second).toContain("# Untitled (ID: 2)");
    expect(second).not.toContain("undefined");
  });

  it("never prints geometry", async () => {
    mockGetArea.mockResolvedValueOnce(ecrinsDetail);

    const result = await handleGetArea({ id: 14403 });

    expect(result).not.toContain("Polygon");
    expect(result).not.toContain("coordinates");
    expect(result).not.toMatch(/\d+\.\d+,\s*\d+\.\d+/);
  });

  it("propagates a 404 rejection", async () => {
    mockGetArea.mockRejectedValueOnce(new Error("Camptocamp API error: 404 Not Found"));

    await expect(handleGetArea({ id: 999999999 })).rejects.toThrow("Camptocamp API error: 404");
  });
});

describe("schemas", () => {
  it("rejects an unknown area_type and accepts the three valid ones", () => {
    expect(searchAreasSchema.safeParse({ query: "ecrins", area_type: "massif" }).success).toBe(false);
    for (const area_type of ["range", "admin_limits", "country"]) {
      expect(searchAreasSchema.safeParse({ query: "ecrins", area_type }).success).toBe(true);
    }
  });

  it("bounds limit to 1-50 with a default of 10", () => {
    expect(searchAreasSchema.safeParse({ query: "ecrins", limit: 0 }).success).toBe(false);
    expect(searchAreasSchema.safeParse({ query: "ecrins", limit: 51 }).success).toBe(false);
    expect(searchAreasSchema.parse({ query: "ecrins" }).limit).toBe(10);
  });

  it("requires query", () => {
    expect(searchAreasSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a blank query", () => {
    for (const query of ["", "   "]) {
      const parsed = searchAreasSchema.safeParse({ query });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues).toEqual([
        expect.objectContaining({ path: ["query"], message: "must not be blank" }),
      ]);
    }
  });

  it("requires a positive integer id", () => {
    expect(getAreaSchema.safeParse({ id: 0 }).success).toBe(false);
    expect(getAreaSchema.safeParse({ id: -1 }).success).toBe(false);
    expect(getAreaSchema.safeParse({ id: 1.5 }).success).toBe(false);
    expect(getAreaSchema.safeParse({ id: 14403 }).success).toBe(true);
  });
});

describe("areaToolDefinitions", () => {
  it("registers search_areas and get_area", () => {
    expect(areaToolDefinitions.map((t) => t.name)).toEqual(["search_areas", "get_area"]);
  });

  it("says in the get_area description that text between the markers is user-written content, not instructions", () => {
    const description = areaToolDefinitions.find((t) => t.name === "get_area")?.description ?? "";

    expect(description).toContain(USER_TEXT_NOTE);
    expect(description).not.toContain("markup included");
  });

  it("describes area types and the area_id hand-off to every search tool", () => {
    const description = areaToolDefinitions.find((t) => t.name === "search_areas")?.description ?? "";

    expect(description).toContain("admin_limits");
    expect(description).toContain("département");
    expect(description).toContain("canton");
    expect(description).toContain("area_id");
    expect(description).toContain("search_routes");
    expect(description).toContain("search_waypoints");
    expect(description).toContain("search_routes, search_waypoints and search_outings");
  });
});
