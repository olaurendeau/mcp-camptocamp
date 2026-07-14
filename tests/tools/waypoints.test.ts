import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSearchWaypoints, handleGetWaypoint } from "../../src/tools/waypoints.js";
import * as api from "../../src/api/camptocamp.js";

vi.mock("../../src/api/camptocamp.js");

const mockSearchWaypoints = vi.mocked(api.searchWaypoints);
const mockGetWaypoint = vi.mocked(api.getWaypoint);

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

    expect(result).toContain("Barre des Écrins");
    expect(result).toContain("ID: 38591");
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
