import { describe, it, expect } from "vitest";
import { connect, jsonResponse, stubFetch } from "./helpers.js";
import { DETAIL_LANG_NOTE, LANG_NOTE } from "../../src/tools/inputs.js";

const ACCEPTED_ID = 1956293;

// Integers that zod's .int() lets through but that cannot be sent as a document ID:
// 1e21 is serialised as "1e+21", and 2^53 is the first integer that is no longer exact.
const UNSAFE_IDS = [1e21, Number.MAX_SAFE_INTEGER + 1];

// Real Camptocamp v6 search shape when nothing matches.
const EMPTY_SEARCH = { total: 0, documents: [] };

// Minimal real detail shapes: most optional fields are missing on live documents.
const fr = (title: string) => [{ lang: "fr", title }];
const ROUTE = { document_id: ACCEPTED_ID, locales: fr("Arête des Cosmiques"), activities: ["mountain_climbing"] };
const WAYPOINT = { document_id: ACCEPTED_ID, locales: fr("Mont Blanc"), waypoint_type: "summit", elevation: 4806 };
const OUTING = { document_id: ACCEPTED_ID, locales: fr("Cosmiques en conditions"), activities: ["mountain_climbing"] };
const AREA = { document_id: ACCEPTED_ID, locales: fr("Massif du Mont-Blanc"), area_type: "range" };
const BOOK = { document_id: ACCEPTED_ID, locales: fr("Guide Vallot") };
const ARTICLE = { document_id: ACCEPTED_ID, locales: fr("Choisir ses crampons"), article_type: "collab" };

interface IdField {
  tool: string;
  field: string;
  args: (id: number) => Record<string, unknown>;
  response: unknown;
}

// Every integer document ID accepted by a tool.
const ID_FIELDS: IdField[] = [
  { tool: "get_route", field: "id", args: (id) => ({ id }), response: ROUTE },
  { tool: "get_waypoint", field: "id", args: (id) => ({ id }), response: WAYPOINT },
  { tool: "get_outing", field: "id", args: (id) => ({ id }), response: OUTING },
  { tool: "get_area", field: "id", args: (id) => ({ id }), response: AREA },
  { tool: "get_book", field: "id", args: (id) => ({ id }), response: BOOK },
  { tool: "get_article", field: "id", args: (id) => ({ id }), response: ARTICLE },
  { tool: "search_user_outings", field: "user_id", args: (user_id) => ({ user_id }), response: EMPTY_SEARCH },
  { tool: "search_routes", field: "area_id", args: (area_id) => ({ area_id }), response: EMPTY_SEARCH },
  { tool: "search_routes", field: "waypoint_id", args: (waypoint_id) => ({ waypoint_id }), response: EMPTY_SEARCH },
  { tool: "search_waypoints", field: "area_id", args: (area_id) => ({ area_id }), response: EMPTY_SEARCH },
  { tool: "search_outings", field: "area_id", args: (area_id) => ({ area_id }), response: EMPTY_SEARCH },
  { tool: "search_outings", field: "route_id", args: (route_id) => ({ route_id }), response: EMPTY_SEARCH },
  { tool: "search_outings", field: "waypoint_id", args: (waypoint_id) => ({ waypoint_id }), response: EMPTY_SEARCH },
  { tool: "search_outings", field: "user_id", args: (user_id) => ({ user_id }), response: EMPTY_SEARCH },
];

const CASES = ID_FIELDS.map((f) => [`${f.tool} ${f.field}`, f] as const);

type Client = Awaited<ReturnType<typeof connect>>;
type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

/** Text of a tool result, which the server always returns as one text block. */
function resultText(result: ToolResult): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0].text;
}

/**
 * The zod issues of an SDK input validation error for `tool`, one "<message> at <path>" line each
 * (array items read `field[1]`), as an MCP client sees them.
 */
function validationIssues(result: ToolResult, tool: string): string[] {
  expect(result.isError).toBe(true);
  const text = resultText(result);
  const prefix = `MCP error -32602: Input validation error: Invalid arguments for tool ${tool}: `;
  expect(text.startsWith(prefix), text).toBe(true);
  return text.slice(prefix.length).split("\n");
}

describe("integer ID inputs", () => {
  it.each(CASES)("%s accepts a real Camptocamp ID", async (_label, { tool, args, response }) => {
    const fetchMock = stubFetch(jsonResponse(response));
    const client = await connect();

    const result = await client.callTool({ name: tool, arguments: args(ACCEPTED_ID) });

    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0] as string).toContain(String(ACCEPTED_ID));
  });

  describe.each(UNSAFE_IDS)("rejects %d", (unsafeId) => {
    it.each(CASES)("%s without calling Camptocamp", async (_label, { tool, field, args }) => {
      const fetchMock = stubFetch();
      const client = await connect();

      const result = await client.callTool({ name: tool, arguments: args(unsafeId) });

      expect(validationIssues(result, tool)).toEqual([
        `Number must be less than or equal to ${String(Number.MAX_SAFE_INTEGER)} at ${field}`,
      ]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

const MAX_QUERY_LENGTH = 200;

// D5 on #58: any single filter is enough, a call without one is refused.
const ROUTES_FILTER_MESSAGE =
  "Error: search_routes needs at least one filter: query, area_id, waypoint_id, activity, rating_system, " +
  "height_diff_up_min/max, route_types or configuration. Use search_areas to find an area_id.";

// D3 of #210: search_articles needs a query or one of its filters.
const ARTICLES_FILTER_MESSAGE =
  "Error: search_articles needs a query or at least one filter: category, article_type, activity.";

// Every search tool with a free-text `query`.
const QUERY_TOOLS = [
  "search_routes",
  "search_waypoints",
  "search_outings",
  "search_areas",
  "search_books",
  "search_articles",
];

describe("search query inputs", () => {
  it.each(QUERY_TOOLS)("%s accepts a 200-character query", async (tool) => {
    const fetchMock = stubFetch(jsonResponse(EMPTY_SEARCH));
    const client = await connect();

    const result = await client.callTool({ name: tool, arguments: { query: "a".repeat(MAX_QUERY_LENGTH) } });

    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(QUERY_TOOLS)("%s rejects a 201-character query without calling Camptocamp", async (tool) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({ name: tool, arguments: { query: "a".repeat(MAX_QUERY_LENGTH + 1) } });

    expect(validationIssues(result, tool)).toEqual([
      `String must contain at most ${String(MAX_QUERY_LENGTH)} character(s) at query`,
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // D3: a blank query would list the whole collection, never a useful answer.
  describe.each(["search_areas", "search_books"])("%s", (tool) => {
    it.each(["", "   "])("rejects the blank query %j without calling Camptocamp", async (query) => {
      const fetchMock = stubFetch();
      const client = await connect();

      const result = await client.callTool({ name: tool, arguments: { query } });

      expect(validationIssues(result, tool)).toEqual(["must not be blank at query"]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // Where query is optional, a blank query still counts as missing.
  it.each([
    ["search_routes", ROUTES_FILTER_MESSAGE],
    [
      "search_waypoints",
      "Error: search_waypoints needs a query, an area_id, or both. Use search_areas to find an area_id.",
    ],
    ["search_articles", ARTICLES_FILTER_MESSAGE],
  ])("%s treats a blank query as missing", async (tool, message) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({ name: tool, arguments: { query: "   " } });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("search_outings treats a blank query as missing and searches without q", async () => {
    const fetchMock = stubFetch(jsonResponse(EMPTY_SEARCH));
    const client = await connect();

    const result = await client.callTool({ name: "search_outings", arguments: { query: "   " } });

    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.has("q")).toBe(false);
  });
});

const OUTING_ACTIVITY_LIST =
  "skitouring, snow_ice_mixed, mountain_climbing, rock_climbing, ice_climbing, hiking, snowshoeing, paragliding, mountain_biking, via_ferrata, slacklining";

const PERIOD_MESSAGE = "must be a real day in MM-DD format (e.g. 06-01; 02-29 allowed)";

// D2: the SDK reports search_outings field rules, naming the field.
describe("search_outings field inputs", () => {
  it.each<[string, Record<string, unknown>, string, string]>([
    [
      "a date that does not exist",
      { date_from: "2026-02-30" },
      "date_from",
      "must be a real date in YYYY-MM-DD format",
    ],
    ["a malformed date", { date_to: "2026-9-1" }, "date_to", "must be a real date in YYYY-MM-DD format"],
    ["an unknown activity", { activity: "skiing" }, "activity", `must be one of: ${OUTING_ACTIVITY_LIST}`],
    ["a day that does not exist", { period_start: "02-30", period_end: "03-10" }, "period_start", PERIOD_MESSAGE],
    ["a period day without zero padding", { period_start: "06-01", period_end: "6-1" }, "period_end", PERIOD_MESSAGE],
    ["a full date as period", { period_start: "2020-06-01", period_end: "06-30" }, "period_start", PERIOD_MESSAGE],
    [
      "a date with words around it",
      { date_from: "on 2026-09-01" },
      "date_from",
      "must be a real date in YYYY-MM-DD format",
    ],
    [
      "an unknown condition",
      { condition_at_least: "XX" },
      "condition_at_least",
      "must be one of: excellent, good, average, poor, awful",
    ],
    [
      "a negative max elevation",
      { max_elevation_min: -1 },
      "max_elevation_min",
      "Number must be greater than or equal to 0",
    ],
  ])("rejects %s with the field and the rule", async (_label, args, field, message) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({ name: "search_outings", arguments: args });

    // One line per bad field: a malformed value fails the format check only, not also the real-date one.
    expect(validationIssues(result, "search_outings")).toEqual([`${message} at ${field}`]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports each malformed date or period day once", async () => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({
      name: "search_outings",
      arguments: { date_from: "2026-9-1", date_to: "26-09-01", period_start: "6-1", period_end: "06-1" },
    });

    expect(validationIssues(result, "search_outings")).toEqual([
      "must be a real date in YYYY-MM-DD format at date_from",
      "must be a real date in YYYY-MM-DD format at date_to",
      `${PERIOD_MESSAGE} at period_start`,
      `${PERIOD_MESSAGE} at period_end`,
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["limit 0", { limit: 0 }, "Number must be greater than or equal to 1 at limit"],
    ["limit 51", { limit: 51 }, "Number must be less than or equal to 50 at limit"],
    ["a negative offset", { offset: -1 }, "Number must be greater than or equal to 0 at offset"],
    ["a non-integer offset", { offset: 1.5 }, "Expected integer, received float at offset"],
    ["a negative route_id", { route_id: -1 }, "Number must be greater than 0 at route_id"],
    ["a non-integer area_id", { area_id: 1.5 }, "Expected integer, received float at area_id"],
    ["a negative user_id", { user_id: -1 }, "Number must be greater than 0 at user_id"],
  ])("rejects %s naming the field without calling Camptocamp", async (_label, args, issue) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({ name: "search_outings", arguments: args });

    expect(validationIssues(result, "search_outings")).toEqual([issue]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("applies the default limit and offset before searching", async () => {
    const fetchMock = stubFetch(jsonResponse(EMPTY_SEARCH));
    const client = await connect();

    const result = await client.callTool({ name: "search_outings", arguments: {} });

    expect(resultText(result)).toBe("No outings found.");
    const params = new URL(fetchMock.mock.calls[0][0] as string).searchParams;
    expect(params.get("limit")).toBe("10");
    expect(params.get("offset")).toBe("0");
  });
});

// AC5.5: rules across several fields keep their exact messages through MCP.
describe("cross-field rules", () => {
  it.each<[string, string, Record<string, unknown>, string]>([
    [
      "search_outings",
      "a reversed date range",
      { date_from: "2026-09-30", date_to: "2026-09-01" },
      "Error: date_from (2026-09-30) must be on or before date_to (2026-09-01).",
    ],
    [
      "search_outings",
      "offset + limit above 10,000",
      { offset: 9995, limit: 10 },
      "Error: offset + limit must not exceed 10000: Camptocamp only returns the first 10,000 results of a search. Narrow the filters instead.",
    ],
    ["search_routes", "a call without any filter", {}, ROUTES_FILTER_MESSAGE],
    [
      "search_outings",
      "period_start without period_end",
      { period_start: "06-01" },
      "Error: period_start and period_end must be given together (MM-DD, e.g. 06-01 and 06-30).",
    ],
    [
      "search_outings",
      "a period wrapping around the new year",
      { period_start: "12-20", period_end: "01-10" },
      "Error: period cannot wrap around the new year; make two calls (12-20 → 12-31 and 01-01 → 01-10)",
    ],
    [
      "search_routes",
      "offset + limit above 10,000",
      { query: "mont blanc", offset: 9995, limit: 10 },
      "Error: offset + limit must not exceed 10000: Camptocamp only returns the first 10,000 results of a search. Narrow the filters instead.",
    ],
    [
      "search_routes",
      "an off-scale rating bound",
      { area_id: 14409, rating_system: "global_rating", rating_min: "XX" },
      'Error: rating_min "XX" is not a valid global_rating value; valid values: F, F+, PD-, PD, PD+, AD-, AD, AD+, D-, D, D+, TD-, TD, TD+, ED-, ED, ED+, ED4, ED5, ED6, ED7',
    ],
    [
      "search_routes",
      "reversed rating bounds",
      { rating_system: "ski_rating", rating_min: "4.2", rating_max: "3.1" },
      "Error: rating_min must not be above rating_max",
    ],
    [
      "search_waypoints",
      "neither query nor area_id",
      {},
      "Error: search_waypoints needs a query, an area_id, or both. Use search_areas to find an area_id.",
    ],
    ["search_articles", "neither query nor filter", {}, ARTICLES_FILTER_MESSAGE],
  ])("%s rejects %s with its message", async (tool, _label, args, message) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({ name: tool, arguments: args });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // AC9.4: the window rule is shared by every paged search.
  it.each(["search_waypoints", "search_areas", "search_books", "search_articles"])(
    "%s refuses offset + limit above 10,000 without calling Camptocamp",
    async (tool) => {
      const fetchMock = stubFetch();
      const client = await connect();

      const result = await client.callTool({ name: tool, arguments: { query: "mont blanc", offset: 9995, limit: 10 } });

      expect(result.isError).toBe(true);
      expect(resultText(result)).toBe(
        "Error: offset + limit must not exceed 10000: Camptocamp only returns the first 10,000 results of a search. Narrow the filters instead.",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(["search_waypoints", "search_areas", "search_books", "search_articles"])(
    "%s sends offset and limit through MCP, offset 0 by default",
    async (tool) => {
      const fetchMock = stubFetch(jsonResponse(EMPTY_SEARCH), jsonResponse(EMPTY_SEARCH));
      const client = await connect();

      await client.callTool({ name: tool, arguments: { query: "pourri", offset: 9990, limit: 10 } });
      await client.callTool({ name: tool, arguments: { query: "pourri" } });

      const [paged, first] = fetchMock.mock.calls.map((call) => new URL(call[0] as string).searchParams);
      expect(paged.get("offset")).toBe("9990");
      expect(paged.get("limit")).toBe("10");
      expect(first.get("offset")).toBe("0");
    },
  );

  it.each(["search_waypoints", "search_areas", "search_books", "search_articles"])(
    "%s rejects a negative offset naming the field without calling Camptocamp",
    async (tool) => {
      const fetchMock = stubFetch();
      const client = await connect();

      const result = await client.callTool({ name: tool, arguments: { query: "pourri", offset: -1 } });

      expect(validationIssues(result, tool)).toEqual(["Number must be greater than or equal to 0 at offset"]);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each<[string, Record<string, unknown>]>([
    ["offset + limit of exactly 10,000", { offset: 9990, limit: 10 }],
    ["equal date_from and date_to", { date_from: "2026-08-10", date_to: "2026-08-10" }],
    ["the leap day as a one-day period", { period_start: "02-29", period_end: "02-29" }],
  ])("search_outings accepts %s", async (_label, args) => {
    const fetchMock = stubFetch(jsonResponse(EMPTY_SEARCH));
    const client = await connect();

    const result = await client.callTool({ name: "search_outings", arguments: args });

    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("search_outings sends a period and a user_id through MCP", async () => {
    const fetchMock = stubFetch(jsonResponse(EMPTY_SEARCH));
    const client = await connect();

    await client.callTool({
      name: "search_outings",
      arguments: { user_id: 430052, period_start: "06-01", period_end: "06-30" },
    });

    const params = new URL(fetchMock.mock.calls[0][0] as string).searchParams;
    expect(params.get("period")).toBe("2020-06-01,2020-06-30");
    expect(params.get("u")).toBe("430052");
  });
});

// R7: the SDK refuses a value outside Camptocamp's closed lists, naming the field and the valid values.
describe("search_routes field inputs", () => {
  it.each<[string, Record<string, unknown>, string, string]>([
    ["an unknown activity", { activity: "skiing" }, "activity", `must be one of: ${OUTING_ACTIVITY_LIST}`],
    [
      "an unknown configuration",
      { area_id: 14409, configuration: ["edge", "arete"] },
      "configuration[1]",
      "must be one of: edge, pillar, face, corridor, goulotte, glacier",
    ],
    [
      "an unknown route type",
      { area_id: 14409, route_types: ["one_way"] },
      "route_types[0]",
      "must be one of: return_same_way, loop, loop_hut, traverse, raid, expedition",
    ],
    [
      "an unknown rating system",
      { rating_system: "rating", rating_min: "AD" },
      "rating_system",
      "must be one of: ski_rating, ski_exposition, labande_ski_rating, labande_global_rating, global_rating, " +
        "engagement_rating, risk_rating, equipment_rating, rock_free_rating, rock_required_rating, " +
        "exposition_rock_rating, aid_rating, ice_rating, mixed_rating, via_ferrata_rating, hiking_rating, " +
        "hiking_mtb_exposition, snowshoe_rating, mtb_up_rating, mtb_down_rating",
    ],
    [
      "a rating bound over 8 characters",
      { rating_system: "global_rating", rating_min: "AD".repeat(5) },
      "rating_min",
      "String must contain at most 8 character(s)",
    ],
    [
      "a negative elevation gain",
      { height_diff_up_min: -1 },
      "height_diff_up_min",
      "Number must be greater than or equal to 0",
    ],
  ])("rejects %s without calling Camptocamp", async (_label, args, path, message) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({ name: "search_routes", arguments: args });

    expect(validationIssues(result, "search_routes")).toEqual([`${message} at ${path}`]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the filters of AC4.1, AC4.4 and AC4.5 as Camptocamp search parameters", async () => {
    const fetchMock = stubFetch(jsonResponse(EMPTY_SEARCH), jsonResponse(EMPTY_SEARCH));
    const client = await connect();

    await client.callTool({
      name: "search_routes",
      arguments: {
        area_id: 14409,
        activity: "skitouring",
        rating_system: "ski_rating",
        rating_min: "3.1",
        rating_max: "4.1",
        height_diff_up_min: 1000,
        height_diff_up_max: 1500,
        route_types: ["traverse"],
        configuration: ["edge", "face"],
      },
    });
    await client.callTool({ name: "search_routes", arguments: { waypoint_id: 37916, activity: "skitouring" } });

    const [first, second] = fetchMock.mock.calls.map(([url]) => new URL(url as string).searchParams);
    expect(Object.fromEntries(first)).toEqual({
      limit: "10",
      offset: "0",
      pl: "fr",
      a: "14409",
      act: "skitouring",
      trat: "3.1,4.1",
      hdif: "1000,1500",
      rtyp: "traverse",
      conf: "edge,face",
    });
    expect(Object.fromEntries(second)).toEqual({ limit: "10", offset: "0", pl: "fr", w: "37916", act: "skitouring" });
  });
});

// AC9.2, AC9.3, R7: type and activity filters on search_waypoints and search_books.
describe("search_waypoints and search_books type inputs", () => {
  it.each<[string, Record<string, unknown>, string, string]>([
    [
      "search_waypoints",
      { query: "pourri", waypoint_type: "refuge" },
      "waypoint_type",
      "must be one of: summit, pass, lake, waterfall, locality, bisse, canyon, access, climbing_outdoor, climbing_indoor, hut, gite, shelter, bivouac, camp_site, base_camp, local_product, paragliding_takeoff, paragliding_landing, cave, waterpoint, weather_station, webcam, virtual, slackline_spot, misc",
    ],
    [
      "search_books",
      { query: "vanoise", book_type: "nonsense" },
      "book_type",
      "must be one of: topo, environment, historical, biography, photos-art, novel, technics, tourism, magazine",
    ],
    ["search_books", { query: "vanoise", activity: "skiing" }, "activity", `must be one of: ${OUTING_ACTIVITY_LIST}`],
  ])("%s rejects %j without calling Camptocamp", async (tool, args, field, message) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({ name: tool, arguments: args });

    expect(validationIssues(result, tool)).toEqual([`${message} at ${field}`]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends wtyp, btyp and act as Camptocamp search parameters", async () => {
    const fetchMock = stubFetch(jsonResponse(EMPTY_SEARCH), jsonResponse(EMPTY_SEARCH));
    const client = await connect();

    await client.callTool({ name: "search_waypoints", arguments: { query: "pourri", waypoint_type: "hut" } });
    await client.callTool({
      name: "search_books",
      arguments: { query: "vanoise", book_type: "topo", activity: "skitouring" },
    });

    const [waypoints, books] = fetchMock.mock.calls.map(([url]) => new URL(url as string).searchParams);
    expect(Object.fromEntries(waypoints)).toEqual({ q: "pourri", limit: "10", offset: "0", pl: "fr", wtyp: "hut" });
    expect(Object.fromEntries(books)).toEqual({
      q: "vanoise",
      limit: "10",
      offset: "0",
      pl: "fr",
      btyp: "topo",
      act: "skitouring",
    });
  });
});

// AC3.5 of #210, R7: the API ignores an unknown acat, atyp or act and lists every article, so each is refused.
describe("search_articles filter inputs", () => {
  it.each<[Record<string, unknown>, string, string]>([
    [
      { category: "bogus" },
      "category",
      "must be one of: mountain_environment, gear, technical, topoguide_supplements, soft_mobility, expeditions, stories, c2c_meetings, tags, site_info, association",
    ],
    [{ article_type: "wiki" }, "article_type", "must be one of: collab, personal"],
    [{ activity: "ski" }, "activity", `must be one of: ${OUTING_ACTIVITY_LIST}`],
  ])("rejects %j without calling Camptocamp", async (args, field, message) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({ name: "search_articles", arguments: args });

    expect(validationIssues(result, "search_articles")).toEqual([`${message} at ${field}`]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends acat, atyp and act, and no q for a blank query", async () => {
    const fetchMock = stubFetch(jsonResponse(EMPTY_SEARCH), jsonResponse(EMPTY_SEARCH));
    const client = await connect();

    await client.callTool({
      name: "search_articles",
      arguments: {
        query: "avalanche",
        category: "mountain_environment",
        article_type: "collab",
        activity: "skitouring",
      },
    });
    const blank = await client.callTool({ name: "search_articles", arguments: { query: "  ", category: "gear" } });

    const [all, gear] = fetchMock.mock.calls.map(([url]) => new URL(url as string).searchParams);
    expect(Object.fromEntries(all)).toEqual({
      q: "avalanche",
      limit: "10",
      offset: "0",
      pl: "fr",
      acat: "mountain_environment",
      atyp: "collab",
      act: "skitouring",
    });
    expect(Object.fromEntries(gear)).toEqual({ limit: "10", offset: "0", pl: "fr", acat: "gear" });
    expect(resultText(blank)).toBe("No articles found matching category gear.");
  });
});

const OUTING_RATING_SYSTEMS =
  "ski_rating, labande_global_rating, global_rating, engagement_rating, equipment_rating, ice_rating, " +
  "rock_free_rating, via_ferrata_rating, hiking_rating, snowshoe_rating, mtb_up_rating, mtb_down_rating";

// S6 on #153: the outing filters on reported rating, conditions, max elevation and elevation gain.
describe("search_outings rating, condition and elevation filters", () => {
  // AC6.4: the API silently ignores these 8 route rating systems on /outings, so they are refused.
  it.each([
    "labande_ski_rating",
    "ski_exposition",
    "risk_rating",
    "rock_required_rating",
    "exposition_rock_rating",
    "aid_rating",
    "mixed_rating",
    "hiking_mtb_exposition",
  ])("rejects rating_system %s, listing the 12 outing systems, without calling Camptocamp", async (system) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({
      name: "search_outings",
      arguments: { area_id: 14409, rating_system: system, rating_min: "1" },
    });

    expect(validationIssues(result, "search_outings")).toEqual([
      `must be one of: ${OUTING_RATING_SYSTEMS} at rating_system`,
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, unknown>, string]>([
    [
      "an off-scale rating bound",
      { rating_system: "ski_rating", rating_min: "S3" },
      'Error: rating_min "S3" is not a valid ski_rating value; valid values: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6',
    ],
    [
      "reversed rating bounds",
      { rating_system: "hiking_rating", rating_min: "T4", rating_max: "T2" },
      "Error: rating_min must not be above rating_max",
    ],
    [
      "rating bounds without a rating_system",
      { rating_max: "AD" },
      `Error: rating_min and rating_max need a rating_system, one of: ${OUTING_RATING_SYSTEMS}`,
    ],
    [
      "reversed max elevation bounds",
      { max_elevation_min: 4000, max_elevation_max: 3000 },
      "Error: max_elevation_min must not be above max_elevation_max",
    ],
  ])("rejects %s with its message, without calling Camptocamp", async (_label, args, message) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({ name: "search_outings", arguments: args });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the filters of AC6.2 and the one-sided ranges of AC6.3 as Camptocamp search parameters", async () => {
    const fetchMock = stubFetch(jsonResponse(EMPTY_SEARCH), jsonResponse(EMPTY_SEARCH));
    const client = await connect();

    await client.callTool({
      name: "search_outings",
      arguments: {
        area_id: 14409,
        activity: "skitouring",
        rating_system: "ski_rating",
        rating_min: "3.1",
        rating_max: "4.1",
        condition_at_least: "good",
        max_elevation_min: 3000,
        max_elevation_max: 4000,
        height_diff_up_min: 1000,
        height_diff_up_max: 1500,
      },
    });
    await client.callTool({
      name: "search_outings",
      arguments: {
        rating_system: "global_rating",
        rating_max: "AD",
        max_elevation_min: 3000,
        height_diff_up_max: 1500,
      },
    });

    const [full, oneSided] = fetchMock.mock.calls.map(([url]) => new URL(url as string).searchParams);
    expect(Object.fromEntries(full)).toEqual({
      a: "14409",
      act: "skitouring",
      trat: "3.1,4.1",
      ocond: "excellent,good",
      oalt: "3000,4000",
      odif: "1000,1500",
      sort: "-date_end",
      limit: "10",
      offset: "0",
      pl: "fr",
    });
    expect(Object.fromEntries(oneSided)).toEqual({
      grat: ",AD",
      oalt: "3000",
      odif: ",1500",
      sort: "-date_end",
      limit: "10",
      offset: "0",
      pl: "fr",
    });
  });
});

// AC5.1, AC5.3 on #153: the get_* tools take an optional lang, checked before any request; a detail request still
// has no query string, whatever the lang.
describe("get_* lang input", () => {
  const DETAIL_CASES = ID_FIELDS.filter((f) => f.tool.startsWith("get_")).map((f) => [f.tool, f] as const);

  it("covers the six get_* tools", () => {
    expect(DETAIL_CASES.map(([tool]) => tool)).toEqual([
      "get_route",
      "get_waypoint",
      "get_outing",
      "get_area",
      "get_book",
      "get_article",
    ]);
  });

  it.each(DETAIL_CASES)("%s refuses lang ru without calling Camptocamp", async (tool) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({ name: tool, arguments: { id: ACCEPTED_ID, lang: "ru" } });

    expect(validationIssues(result, tool)).toEqual(["must be one of: fr, en, de, it, es, ca, eu, sl, zh at lang"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(DETAIL_CASES)("%s accepts lang de and sends no query string", async (tool, { response }) => {
    const fetchMock = stubFetch(jsonResponse(response));
    const client = await connect();

    const result = await client.callTool({ name: tool, arguments: { id: ACCEPTED_ID, lang: "de" } });

    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(new URL(fetchMock.mock.calls[0][0] as string).search).toBe("");
    expect(resultText(result)).toContain("(no de version; available: fr)");
  });

  it.each(DETAIL_CASES)(
    "%s states lang, its default, the fallback order and the Language line (AC5.10)",
    async (tool) => {
      const client = await connect();

      const { tools } = await client.listTools();

      const description = tools.find((t) => t.name === tool)?.description;
      expect(description).toContain(LANG_NOTE);
      expect(description).toContain(DETAIL_LANG_NOTE);
    },
  );

  // AC1.10 on #210: the note explains the Text line, how to read that text, and that versions are not translations.
  it("states what the Text in other languages line lists and how to read it", () => {
    expect(DETAIL_LANG_NOTE).toContain("'**Language**: en (no de version; available: it, en)'");
    expect(DETAIL_LANG_NOTE).toContain(
      "'**Text in other languages**: gear (de, en)' lists sections written only in other languages",
    );
    expect(DETAIL_LANG_NOTE).toContain("call again with one of those lang values to read them");
    expect(DETAIL_LANG_NOTE).toContain("Language versions are written separately and may differ.");
  });
});

// AC5.1, AC5.2 on #153: the seven searches take an optional lang, checked before any request and sent as pl
// (default fr); the Language line stays on the get_* tools.
describe("search lang input", () => {
  const SEARCH_CASES: Array<[string, Record<string, unknown>]> = [
    ["search_routes", { query: "Glacier du Geay" }],
    ["search_waypoints", { query: "Mont Pourri" }],
    ["search_user_outings", { user_id: ACCEPTED_ID }],
    ["search_outings", {}],
    ["search_areas", { query: "Vanoise" }],
    ["search_books", { query: "Vallot" }],
    ["search_articles", { query: "crampons" }],
  ];

  it.each(SEARCH_CASES)("%s refuses lang ru without calling Camptocamp", async (tool, args) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({ name: tool, arguments: { ...args, lang: "ru" } });

    expect(validationIssues(result, tool)).toEqual(["must be one of: fr, en, de, it, es, ca, eu, sl, zh at lang"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(SEARCH_CASES)("%s sends lang de as pl=de, and pl=fr without lang", async (tool, args) => {
    const fetchMock = stubFetch(jsonResponse(EMPTY_SEARCH), jsonResponse(EMPTY_SEARCH));
    const client = await connect();

    const withLang = await client.callTool({ name: tool, arguments: { ...args, lang: "de" } });
    const withoutLang = await client.callTool({ name: tool, arguments: args });

    expect(withLang.isError, JSON.stringify(withLang.content)).toBeFalsy();
    expect(resultText(withLang)).toBe(resultText(withoutLang));
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("pl")).toBe("de");
    expect(new URL(fetchMock.mock.calls[1][0] as string).searchParams.get("pl")).toBe("fr");
  });

  it.each(SEARCH_CASES)("%s states lang, its default and the fallback order (AC5.10)", async (tool) => {
    const client = await connect();

    const { tools } = await client.listTools();

    const description = tools.find((t) => t.name === tool)?.description;
    expect(description).toContain(LANG_NOTE);
    expect(description).not.toContain(DETAIL_LANG_NOTE);
  });
});
