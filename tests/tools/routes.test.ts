import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSearchRoutes, handleGetRoute } from "../../src/tools/routes.js";
import * as api from "../../src/api/camptocamp.js";

vi.mock("../../src/api/camptocamp.js");

const mockSearchRoutes = vi.mocked(api.searchRoutes);
const mockGetRoute = vi.mocked(api.getRoute);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleSearchRoutes", () => {
  it("formats results correctly", async () => {
    mockSearchRoutes.mockResolvedValueOnce({
      total: 2,
      documents: [
        {
          id: 1,
          locales: [{ lang: "fr", title: "Voie normale" }],
          activities: ["skitouring"],
          elevation_max: 4808,
          global_rating: "F",
        },
        {
          id: 2,
          locales: [{ lang: "fr", title: "Arête des Cosmiques" }],
          activities: ["rock_climbing"],
          elevation_max: 3842,
        },
      ],
    });

    const result = await handleSearchRoutes({ query: "Mont Blanc", limit: 10 });

    expect(result).toContain("Found 2 route(s)");
    expect(result).toContain("[1] Voie normale");
    expect(result).toContain("4808m");
    expect(result).toContain("Rating: F");
    expect(result).toContain("[2] Arête des Cosmiques");
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
          id: 10,
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
      id: 42,
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
    expect(result).toContain("TD");
    expect(result).toContain("5c");
    expect(result).toContain("3842m");
    expect(result).toContain("Belle arête mixte");
    expect(result).toContain("Crampons");
  });

  it("handles route with minimal data", async () => {
    mockGetRoute.mockResolvedValueOnce({
      id: 99,
      locales: [{ lang: "fr", title: "Simple route" }],
      activities: ["hiking"],
    });

    const result = await handleGetRoute({ id: 99 });

    expect(result).toContain("Simple route");
    expect(result).toContain("hiking");
  });

  it("propagates API errors", async () => {
    mockGetRoute.mockRejectedValueOnce(new Error("Camptocamp API error: 404"));

    await expect(handleGetRoute({ id: 999 })).rejects.toThrow("Camptocamp API error: 404");
  });
});
