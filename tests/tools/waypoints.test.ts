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
    mockSearchWaypoints.mockResolvedValueOnce({
      total: 3,
      documents: [
        {
          id: 1,
          locales: [{ lang: "fr", title: "Mont Blanc" }],
          waypoint_type: "summit",
          elevation: 4808,
        },
        {
          id: 2,
          locales: [{ lang: "fr", title: "Refuge du Goûter" }],
          waypoint_type: "hut",
          elevation: 3835,
        },
        {
          id: 3,
          locales: [{ lang: "fr", title: "Col du Midi" }],
          waypoint_type: "col",
        },
      ],
    });

    const result = await handleSearchWaypoints({ query: "Mont Blanc", limit: 10 });

    expect(result).toContain("Found 3 waypoint(s)");
    expect(result).toContain("[1] Mont Blanc (summit) | 4808m");
    expect(result).toContain("[2] Refuge du Goûter (hut) | 3835m");
    expect(result).toContain("[3] Col du Midi (col)");
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
          id: 5,
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
    mockGetWaypoint.mockResolvedValueOnce({
      id: 50,
      locales: [
        {
          lang: "fr",
          title: "Aiguille du Midi",
          description: "Célèbre aiguille granitique dominant Chamonix.",
          access: "Téléphérique depuis Chamonix.",
        },
      ],
      waypoint_type: "summit",
      elevation: 3842,
      lat: 45.8797,
      lng: 6.8874,
    });

    const result = await handleGetWaypoint({ id: 50 });

    expect(result).toContain("Aiguille du Midi");
    expect(result).toContain("ID: 50");
    expect(result).toContain("summit");
    expect(result).toContain("3842m");
    expect(result).toContain("45.8797");
    expect(result).toContain("6.8874");
    expect(result).toContain("Célèbre aiguille granitique");
    expect(result).toContain("Téléphérique");
  });

  it("handles waypoint without coordinates", async () => {
    mockGetWaypoint.mockResolvedValueOnce({
      id: 77,
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
