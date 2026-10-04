import { describe, it, expect } from "vitest";
import { connect, jsonResponse, stubFetch } from "./helpers.js";

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
  { tool: "search_waypoints", field: "area_id", args: (area_id) => ({ area_id }), response: EMPTY_SEARCH },
  { tool: "search_outings", field: "area_id", args: (area_id) => ({ area_id }), response: EMPTY_SEARCH },
  { tool: "search_outings", field: "route_id", args: (route_id) => ({ route_id }), response: EMPTY_SEARCH },
  { tool: "search_outings", field: "waypoint_id", args: (waypoint_id) => ({ waypoint_id }), response: EMPTY_SEARCH },
];

const CASES = ID_FIELDS.map((f) => [`${f.tool} ${f.field}`, f] as const);

describe("integer ID inputs", () => {
  it.each(CASES)("%s accepts a real Camptocamp ID", async (_label, { tool, args, response }) => {
    const fetchMock = stubFetch(jsonResponse(response));
    const client = await connect();

    const result = await client.callTool({ name: tool, arguments: args(ACCEPTED_ID) });

    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain(String(ACCEPTED_ID));
  });

  describe.each(UNSAFE_IDS)("rejects %d", (unsafeId) => {
    it.each(CASES)("%s without calling Camptocamp", async (_label, { tool, field, args }) => {
      const fetchMock = stubFetch();
      const client = await connect();

      const result = await client.callTool({ name: tool, arguments: args(unsafeId) });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      // The SDK reports the zod issues as JSON after "Invalid arguments for tool <name>: "
      const prefix = `Input validation error: Invalid arguments for tool ${tool}: `;
      const text = content[0].text;
      expect(text).toContain(prefix);
      const issues: unknown = JSON.parse(text.slice(text.indexOf(prefix) + prefix.length));
      expect(issues).toEqual([
        expect.objectContaining({ code: "too_big", maximum: Number.MAX_SAFE_INTEGER, path: [field] }),
      ]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

const MAX_QUERY_LENGTH = 200;

type Client = Awaited<ReturnType<typeof connect>>;

/** Text of a tool result, which the server always returns as one text block. */
function resultText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0].text;
}

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

    expect(result.isError).toBe(true);
    const text = resultText(result);
    expect(text).toContain(`Invalid arguments for tool ${tool}`);
    expect(text).toContain('"query"');
    expect(text).toContain(`"maximum": ${String(MAX_QUERY_LENGTH)}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // D3: a blank query would list the whole collection, never a useful answer.
  describe.each(["search_areas", "search_books", "search_articles"])("%s", (tool) => {
    it.each(["", "   "])("rejects the blank query %j without calling Camptocamp", async (query) => {
      const fetchMock = stubFetch();
      const client = await connect();

      const result = await client.callTool({ name: tool, arguments: { query } });

      expect(result.isError).toBe(true);
      const text = resultText(result);
      expect(text).toContain(`Invalid arguments for tool ${tool}`);
      expect(text).toContain('"query"');
      expect(text).toContain("must not be blank");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // Where query is optional, a blank query still counts as missing.
  it.each(["search_routes", "search_waypoints"])("%s treats a blank query as missing", async (tool) => {
    const fetchMock = stubFetch();
    const client = await connect();

    const result = await client.callTool({ name: tool, arguments: { query: "   " } });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(
      `Error: ${tool} needs a query, an area_id, or both. Use search_areas to find an area_id.`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("search_outings treats a blank query as missing and searches without q", async () => {
    const fetchMock = stubFetch(jsonResponse(EMPTY_SEARCH));
    const client = await connect();

    const result = await client.callTool({ name: "search_outings", arguments: { query: "   " } });

    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.has("q")).toBe(false);
  });
});
