import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSearchUserOutings, handleGetOuting } from "../../src/tools/outings.js";
import * as api from "../../src/api/camptocamp.js";

vi.mock("../../src/api/camptocamp.js");

const mockSearchUserOutings = vi.mocked(api.searchUserOutings);
const mockGetOuting = vi.mocked(api.getOuting);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleSearchUserOutings", () => {
  it("formats results correctly", async () => {
    mockSearchUserOutings.mockResolvedValueOnce({
      total: 2,
      documents: [
        {
          document_id: 1,
          locales: [{ lang: "fr", title: "Sortie en Vanoise" }],
          activities: ["hiking"],
          date_start: "2026-07-01",
          date_end: "2026-07-01",
          elevation_max: 3000,
          global_rating: "PD",
        },
        {
          document_id: 2,
          locales: [{ lang: "fr", title: "Escalade aux Calanques" }],
          activities: ["rock_climbing"],
          date_start: "2026-06-10",
          date_end: "2026-06-12",
          rock_free_rating: "6a",
        },
      ],
    });

    const result = await handleSearchUserOutings({ user_id: 430052, limit: 10 });

    expect(result).toContain("Found 2 outing(s) for user 430052");
    expect(result).toContain("[1] Sortie en Vanoise");
    expect(result).toContain("2026-07-01");
    expect(result).toContain("3000m");
    expect(result).toContain("Rating: PD");
    expect(result).toContain("[2] Escalade aux Calanques");
    expect(result).toContain("2026-06-10 → 2026-06-12");
    expect(result).not.toContain("undefined");
  });

  it("returns empty message when no results", async () => {
    mockSearchUserOutings.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await handleSearchUserOutings({ user_id: 430052, limit: 10 });

    expect(result).toBe("No outings found for user 430052.");
  });

  it("falls back to the first locale, then to Untitled, and omits missing fields", async () => {
    mockSearchUserOutings.mockResolvedValueOnce({
      total: 2,
      documents: [
        {
          document_id: 3,
          locales: [{ lang: "en", title: "Gran Paradiso" }],
          activities: ["skitouring"],
          date_start: "2026-04-02",
        },
        {
          document_id: 4,
          locales: [],
          activities: ["hiking"],
        },
      ],
    });

    const result = await handleSearchUserOutings({ user_id: 430052, limit: 10 });

    expect(result).toContain("- [3] Gran Paradiso (skitouring) | 2026-04-02\n");
    expect(result).toContain("- [4] Untitled (hiking)");
    expect(result).not.toContain("Max elevation");
    expect(result).not.toContain("Rating");
    expect(result).not.toContain("undefined");
  });
});

describe("handleGetOuting", () => {
  it("formats outing detail correctly", async () => {
    mockGetOuting.mockResolvedValueOnce({
      document_id: 42,
      locales: [
        {
          lang: "fr",
          title: "Traversée des Drus",
          description: "Belle journée en montagne.",
          conditions: "Neige dure le matin",
          weather: "Beau",
          timing: "8h",
          participants: "Alice, Bob",
          route_description: "Voie normale puis arête",
        },
      ],
      activities: ["mountain_climbing"],
      date_start: "2026-07-06",
      date_end: "2026-07-06",
      elevation_max: 3754,
      global_rating: "D",
      engagement_rating: "IV",
      participant_count: 2,
      author: { name: "o.laurendeau", user_id: 430052 },
      associations: {
        routes: [{ document_id: 100, locales: [{ lang: "fr", title: "Traversée des Drus" }] }],
      },
    });

    const result = await handleGetOuting({ id: 42 });

    expect(result).toContain("Traversée des Drus");
    expect(result).toContain("ID: 42");
    expect(result).toContain("o.laurendeau");
    expect(result).toContain("3754m");
    expect(result).toContain("Belle journée en montagne");
    expect(result).toContain("Neige dure le matin");
    expect(result).toContain("Alice, Bob");
    expect(result).toContain("[100] Traversée des Drus");
  });

  it("renders every rating and elevation field", async () => {
    mockGetOuting.mockResolvedValueOnce({
      document_id: 43,
      locales: [{ lang: "fr", title: "Arête des Cosmiques" }],
      activities: ["mountain_climbing", "rock_climbing"],
      date_start: "2026-08-01",
      date_end: "2026-08-02",
      hiking_rating: "T4",
      rock_free_rating: "5c",
      equipment_rating: "P1",
      condition_rating: "good",
      elevation_max: 3842,
      elevation_min: 3613,
      height_diff_up: 450,
      height_diff_down: 220,
    });

    const result = await handleGetOuting({ id: 43 });

    expect(result).toContain("**Date**: 2026-08-01 → 2026-08-02");
    expect(result).toContain("**Hiking rating**: T4");
    expect(result).toContain("**Rock free rating**: 5c");
    expect(result).toContain("**Equipment**: P1");
    expect(result).toContain("**Conditions**: good");
    expect(result).toContain("**Min elevation**: 3613m");
    expect(result).toContain("**Elevation gain**: 450m");
    expect(result).toContain("**Elevation loss**: 220m");
  });

  it("omits absent sections and falls back to Untitled", async () => {
    mockGetOuting.mockResolvedValueOnce({
      document_id: 44,
      locales: [],
      activities: ["hiking"],
      associations: {
        routes: [
          { document_id: 101, locales: [{ lang: "it", title: "Via normale" }] },
          { document_id: 102, locales: [] },
        ],
      },
    });

    const result = await handleGetOuting({ id: 44 });

    expect(result).toContain("# Untitled (ID: 44)");
    expect(result).toContain("[101] Via normale");
    expect(result).toContain("[102] Untitled");
    expect(result).not.toContain("**Author**");
    expect(result).not.toContain("**Date**");
    expect(result).not.toContain("## Description");
    expect(result).not.toContain("undefined");
  });

  it("omits the associated routes section when there are none", async () => {
    mockGetOuting.mockResolvedValueOnce({
      document_id: 45,
      locales: [{ lang: "fr", title: "Balade" }],
      activities: ["hiking"],
      associations: { routes: [] },
    });

    const result = await handleGetOuting({ id: 45 });

    expect(result).not.toContain("## Associated routes");
  });

  it("propagates API errors", async () => {
    mockGetOuting.mockRejectedValueOnce(new Error("Camptocamp API error: 404"));

    await expect(handleGetOuting({ id: 999 })).rejects.toThrow("Camptocamp API error: 404");
  });
});
