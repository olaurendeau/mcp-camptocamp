import { describe, it, expect } from "vitest";
import { connect, jsonResponse, stubFetch } from "./helpers.js";
import { routeToolDefinitions } from "../../src/tools/routes.js";
import { waypointToolDefinitions } from "../../src/tools/waypoints.js";
import { outingToolDefinitions } from "../../src/tools/outings.js";
import { areaToolDefinitions } from "../../src/tools/areas.js";
import { bookToolDefinitions } from "../../src/tools/books.js";
import { articleToolDefinitions } from "../../src/tools/articles.js";

const definitions = [
  ...routeToolDefinitions,
  ...waypointToolDefinitions,
  ...outingToolDefinitions,
  ...areaToolDefinitions,
  ...bookToolDefinitions,
  ...articleToolDefinitions,
];

// The 13 tools of the CLAUDE.md "MCP Tools" table
const TOOL_NAMES = [
  "search_routes",
  "get_route",
  "search_waypoints",
  "get_waypoint",
  "search_user_outings",
  "get_outing",
  "search_outings",
  "search_areas",
  "get_area",
  "search_books",
  "get_book",
  "search_articles",
  "get_article",
];

describe("tool registration", () => {
  it("lists exactly the 13 documented tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("exposes each tool with the description of its definition", async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    for (const definition of definitions) {
      const tool = tools.find((t) => t.name === definition.name);
      expect(tool?.description, definition.name).toBe(definition.description);
    }
  });

  it("keeps the input JSON Schema of every tool", async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    const schemas = Object.fromEntries(tools.map((tool) => [tool.name, tool.inputSchema]));
    expect(schemas).toMatchSnapshot();
  });
});

describe("tool calls", () => {
  it("returns a search result as text content", async () => {
    // Real /routes search shape: optional fields such as global_rating can be missing
    const fetchMock = stubFetch(
      jsonResponse({
        total: 1,
        documents: [
          {
            document_id: 53914,
            locales: [{ lang: "fr", title: "Arête des Cosmiques", title_prefix: "Aiguille du Midi" }],
            activities: ["mountain_climbing"],
            elevation_max: 3842,
          },
        ],
      }),
    );
    const client = await connect();

    const result = await client.callTool({ name: "search_routes", arguments: { query: "Cosmiques" } });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      {
        type: "text",
        text: "Found 1 route(s). Showing 1:\n\n- [53914] Arête des Cosmiques (mountain_climbing) | Max elevation: 3842m",
      },
    ]);
  });

  it("returns a detail result as text content", async () => {
    // Real /routes/{id} shape: height_diff_down is null and areas are missing on some routes
    stubFetch(
      jsonResponse({
        document_id: 53914,
        locales: [{ lang: "fr", title: "Arête des Cosmiques", description: "Belle arête mixte." }],
        activities: ["mountain_climbing"],
        global_rating: "AD",
        elevation_max: 3842,
        height_diff_up: 300,
        height_diff_down: null,
      }),
    );
    const client = await connect();

    const result = await client.callTool({ name: "get_route", arguments: { id: 53914 } });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      {
        type: "text",
        text: [
          "# Arête des Cosmiques (ID: 53914)",
          "\n**Activities**: mountain_climbing",
          "**Global rating**: AD",
          "**Max elevation**: 3842m",
          "**Elevation gain**: 300m",
          "\n## Description\nBelle arête mixte.",
        ].join("\n"),
      },
    ]);
  });

  it("returns an upstream failure as an error result", async () => {
    stubFetch(
      new Response("<html><body>Internal Server Error</body></html>", {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "Content-Type": "text/html" },
      }),
    );
    const client = await connect();

    const result = await client.callTool({ name: "get_route", arguments: { id: 53914 } });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe("text");
    expect(content[0].text).toMatch(/^Error: Camptocamp API error: 500/);
  });
});
