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
  });

  it("returns empty message when no results", async () => {
    mockSearchUserOutings.mockResolvedValueOnce({ total: 0, documents: [] });

    const result = await handleSearchUserOutings({ user_id: 430052, limit: 10 });

    expect(result).toBe("No outings found for user 430052.");
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

  it("propagates API errors", async () => {
    mockGetOuting.mockRejectedValueOnce(new Error("Camptocamp API error: 404"));

    await expect(handleGetOuting({ id: 999 })).rejects.toThrow("Camptocamp API error: 404");
  });
});
