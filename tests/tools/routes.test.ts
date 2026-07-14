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
