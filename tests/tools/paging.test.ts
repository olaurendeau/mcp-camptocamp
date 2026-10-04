import { describe, it, expect } from "vitest";
import { MAX_RESULT_WINDOW, assertResultWindow, formatSearchPage } from "../../src/tools/paging.js";
import { searchOffset } from "../../src/tools/inputs.js";

const WINDOW_MESSAGE =
  "offset + limit must not exceed 10000: Camptocamp only returns the first 10,000 results of a search. Narrow the filters instead.";
const WINDOW_SENTENCE = "More results exist beyond Camptocamp's 10,000-result window; narrow the filters.";

const lines = (n: number, first = 1): string[] => Array.from({ length: n }, (_, i) => `- [${first + i}] Doc`);

describe("assertResultWindow", () => {
  it("is Camptocamp's 10,000-result window", () => {
    expect(MAX_RESULT_WINDOW).toBe(10000);
  });

  it("throws the search_outings message when offset + limit passes 10,000", () => {
    expect(() => assertResultWindow(9995, 10)).toThrow(WINDOW_MESSAGE);
  });

  it("accepts offset + limit of exactly 10,000", () => {
    expect(() => assertResultWindow(9990, 10)).not.toThrow();
    expect(() => assertResultWindow(0, 10)).not.toThrow();
  });
});

describe("formatSearchPage", () => {
  it("says nothing was found, naming the filters", () => {
    expect(
      formatSearchPage({ kind: "outing", total: 0, offset: 0, limit: 10, lines: [], filters: ['query "x"', "area 1"] }),
    ).toBe('No outings found matching query "x", area 1.');
  });

  it("says nothing was found without filters", () => {
    expect(formatSearchPage({ kind: "route", total: 0, offset: 0, limit: 10, lines: [] })).toBe("No routes found.");
    expect(formatSearchPage({ kind: "route", total: 0, offset: 0, limit: 10, lines: [], filters: [] })).toBe(
      "No routes found.",
    );
  });

  it("prints the header, the filters, a blank line and the lines", () => {
    const result = formatSearchPage({
      kind: "waypoint",
      total: 3,
      offset: 0,
      limit: 10,
      lines: lines(3),
      filters: ['query "pourri"'],
    });

    expect(result.split("\n")).toEqual([
      "Found 3 waypoint(s). Showing 3 from offset 0:",
      'Filters: query "pourri"',
      "",
      "- [1] Doc",
      "- [2] Doc",
      "- [3] Doc",
    ]);
  });

  it("puts the order after the total and notes after the filters", () => {
    const result = formatSearchPage({
      kind: "outing",
      total: 2,
      offset: 0,
      limit: 10,
      lines: lines(2),
      filters: ["area 14409"],
      notes: ["Note: first note"],
      order: ", most recent first",
    });

    expect(result.split("\n").slice(0, 4)).toEqual([
      "Found 2 outing(s), most recent first. Showing 2 from offset 0:",
      "Filters: area 14409",
      "Note: first note",
      "",
    ]);
  });

  it("omits the Filters line when there is no filter", () => {
    const result = formatSearchPage({ kind: "area", total: 1, offset: 0, limit: 10, lines: lines(1) });

    expect(result.split("\n")).toEqual(["Found 1 area(s). Showing 1 from offset 0:", "", "- [1] Doc"]);
  });

  it("ends with the next page offset when more results follow", () => {
    const result = formatSearchPage({ kind: "outing", total: 23, offset: 0, limit: 10, lines: lines(10) });
    const output = result.split("\n");

    expect(output.at(-2)).toBe("");
    expect(output.at(-1)).toBe("Next page: offset=10");
  });

  it("has no footer on the last page", () => {
    const result = formatSearchPage({ kind: "outing", total: 23, offset: 20, limit: 10, lines: lines(3, 21) });

    expect(result.split("\n").at(-1)).toBe("- [23] Doc");
    expect(result).not.toContain("Next page");
    expect(result).not.toContain(WINDOW_SENTENCE);
  });

  it("gives the next page offset when that page still fits in the 10,000-result window", () => {
    const result = formatSearchPage({ kind: "outing", total: 346652, offset: 9980, limit: 10, lines: lines(10) });

    expect(result.split("\n").at(-1)).toBe("Next page: offset=9990");
  });

  it("points past the 10,000-result window instead of giving an offset that would be refused", () => {
    const result = formatSearchPage({ kind: "outing", total: 346652, offset: 9990, limit: 10, lines: lines(10) });

    expect(result.split("\n").at(-1)).toBe(WINDOW_SENTENCE);
    expect(result).not.toContain("Next page");
  });

  it("has no footer when a page past the end comes back empty", () => {
    const result = formatSearchPage({ kind: "outing", total: 23, offset: 30, limit: 10, lines: [] });

    expect(result).toBe("Found 23 outing(s). Showing 0 from offset 30:");
  });
});

describe("searchOffset", () => {
  it("defaults to 0 and accepts non-negative integers", () => {
    expect(searchOffset().parse(undefined)).toBe(0);
    expect(searchOffset().parse(480)).toBe(480);
  });

  it("refuses negative and non-integer offsets", () => {
    expect(searchOffset().safeParse(-1).success).toBe(false);
    expect(searchOffset().safeParse(1.5).success).toBe(false);
  });

  it("states the 10,000-result window in its description", () => {
    expect(searchOffset().description).toBe("Number of results to skip, for paging (offset + limit ≤ 10,000)");
  });
});
