import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, jsonResponse } from "../server/helpers.js";
import { callTool, postMcp, rpc, startTestServer } from "./helpers.js";

// AC2.6 to AC2.8 on #277: over HTTP, the tools, their schemas and their output are exactly those of the
// in-memory transport, and a failing Camptocamp API is a tool error (HTTP 200, isError), never an HTTP error.

// Runs before the helpers' hook, which shuts the server down: a timeout test that failed must not leave the
// drain on fake timers, nor leak them into the next tests.
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface ToolResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

// Trimmed real GET /routes/53914?lang=fr: unset values come as null, and the fields no formatter reads are kept.
const ROUTE_53914 = {
  document_id: 53914,
  version: 9,
  protected: false,
  type: "r",
  available_langs: ["fr"],
  locales: [
    {
      lang: "fr",
      version: 4,
      title: "Martine is on the rock",
      title_prefix: "Aiguille Dibona",
      summary: null,
      description: "Belle voie **raide**, rocher parfait.\n\n## Approche\nDepuis le refuge du Soreiller (2730 m).",
      remarks: null,
      gear: "Rack complet, 12 dégaines",
      route_history: null,
      topic_id: null,
    },
  ],
  activities: ["rock_climbing"],
  elevation_min: 3000,
  elevation_max: 3131,
  height_diff_up: 250,
  height_diff_down: null,
  height_diff_difficulties: 250,
  global_rating: "TD",
  rock_free_rating: "6a",
  rock_required_rating: "5c",
  engagement_rating: "II",
  equipment_rating: "P1",
  orientations: ["S"],
  quality: "fine",
  geometry: { version: 12, geom_detail: null },
  areas: [
    { document_id: 14403, locales: [{ lang: "fr", title: "Écrins" }], area_type: "range", available_langs: null },
  ],
};

// Trimmed real GET /routes?q=gamma&limit=10&lang=fr; the second document has no title_prefix nor rating.
const GAMMA_SEARCH = {
  total: 2,
  documents: [
    {
      document_id: 57842,
      version: 14,
      available_langs: ["fr", "es"],
      locales: [{ lang: "fr", title: "Voie Gamma", title_prefix: "Barre des Écrins", version: 6, topic_id: null }],
      activities: ["mountain_climbing"],
      elevation_max: 4102,
      height_diff_difficulties: 1100,
      global_rating: "ED",
      rock_free_rating: "6b+",
      quality: "fine",
    },
    {
      document_id: 1148298,
      version: 1,
      available_langs: ["fr"],
      locales: [{ lang: "fr", title: "Gamma « directe »", version: 1, topic_id: null }],
      activities: ["rock_climbing"],
      elevation_max: null,
    },
  ],
};

// Body of the live GET /routes/999999999 response.
const NOT_FOUND_BODY = {
  status: "error",
  errors: [{ location: "body", name: "Not Found", description: "document not found" }],
};

const SERVER_ERROR_BODY = {
  status: "error",
  errors: [{ location: "body", name: "Internal Server Error", description: "database unavailable" }],
};

const notFound = () => jsonResponse(NOT_FOUND_BODY, { status: 404, statusText: "Not Found" });
const serverError = () => jsonResponse(SERVER_ERROR_BODY, { status: 500, statusText: "Internal Server Error" });

/** Answers every fetch with a fresh `respond()`: each transport reads its own copy of the same fixture. */
function stubFetch(respond: () => Response) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(respond()));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A fetch that never answers, and rejects only when its request is aborted. */
function stubHangingFetch() {
  const fetchMock = vi.fn<typeof fetch>(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason as Error);
        });
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function overMemory(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const client = await connect();
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

async function overHttp(port: number, name: string, args: Record<string, unknown>) {
  const response = await postMcp(port, callTool(name, args));
  return { status: response.status, result: (response.json as { result: ToolResult }).result };
}

/** Calls the tool over both transports with the same fetch stub; the HTTP output must match byte for byte. */
async function expectSameOutput(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const { port } = await startTestServer();
  const memory = await overMemory(name, args);
  const http = await overHttp(port, name, args);
  expect(http.status, name).toBe(200);
  expect(http.result.content, name).toHaveLength(1);
  expect(http.result.content[0].type, name).toBe("text");
  expect(http.result.content[0].text, name).toBe(memory.content[0].text);
  expect(http.result.isError, name).toBe(memory.isError);
  expect(http.result, name).toEqual(memory);
  return http.result;
}

/** Runs `call` until it reaches fetch for the `calls`-th time, then lets the 15 s API timeout pass. */
async function afterApiTimeout<T>(fetchMock: ReturnType<typeof stubHangingFetch>, calls: number, call: Promise<T>) {
  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });
  await vi.advanceTimersByTimeAsync(15_000);
  return call;
}

// One valid input per registered tool. Every tool reaches the API with it; search_outings goes through route_ids,
// which sends both routes in a single `r=54513,1148298` request.
const TOOL_ARGUMENTS: Record<string, Record<string, unknown>> = {
  search_routes: { query: "gamma" },
  get_route: { id: 53914 },
  search_waypoints: { query: "Dibona" },
  get_waypoint: { id: 37916 },
  search_user_outings: { user_id: 286726 },
  get_outing: { id: 1630012 },
  search_outings: { route_ids: [54513, 1148298] },
  get_outings: { ids: [1630012, 1924138] },
  outing_stats: { group_by: "month" },
  search_areas: { query: "Écrins" },
  get_area: { id: 14403 },
  search_books: { query: "Écrins" },
  get_book: { id: 154786 },
  search_articles: { query: "corde" },
  get_article: { id: 107016 },
};

// Optional inputs that take another output path, run through the same API-500 test as TOOL_ARGUMENTS.
const EXTRA_ARGUMENTS: [string, Record<string, unknown>][] = [
  ["outing_stats", { group_by: "month", split_by: "condition" }],
  ["get_book", { id: 853932, routes_offset: 50 }],
];

const API_500_CASES = [...Object.entries(TOOL_ARGUMENTS), ...EXTRA_ARGUMENTS];

// get_outings never fails once its input is valid: an unreadable ID prints "Error: <message>" in its block.
const NEVER_AN_ERROR_RESULT = new Set(["get_outings"]);

describe("HTTP fidelity with the in-memory transport", () => {
  it("lists the same tools, input schemas and annotations", async () => {
    const { port } = await startTestServer();
    const client = await connect();
    const memory = await client.listTools();
    const http = await postMcp(port, rpc("tools/list"));

    expect(http.status).toBe(200);
    const { tools } = (http.json as { result: { tools: unknown[] } }).result;
    expect(tools).toEqual(memory.tools);
    expect(JSON.stringify(tools)).toBe(JSON.stringify(memory.tools));
    expect(tools).toHaveLength(15);
  });

  it("gives the same get_route output", async () => {
    stubFetch(() => jsonResponse(ROUTE_53914));
    const result = await expectSameOutput("get_route", { id: 53914 });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(/^# Aiguille Dibona : Martine is on the rock \(ID: 53914\)\n/);
    expect(result.content[0].text).toContain("**Global rating**: TD");
    expect(result.content[0].text).toContain("rocher parfait");
  });

  it("gives the same search_routes output", async () => {
    stubFetch(() => jsonResponse(GAMMA_SEARCH));
    const result = await expectSameOutput("search_routes", { query: "gamma" });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("[57842] Barre des Écrins : Voie Gamma");
    expect(result.content[0].text).toContain("[1148298] Gamma « directe »");
  });

  it("gives the same error result for an API 404", async () => {
    stubFetch(notFound);
    const result = await expectSameOutput("get_route", { id: 999999999 });
    expect(result).toEqual({
      content: [
        { type: "text", text: "Error: Camptocamp API error: 404 Not Found (route 999999999): document not found" },
      ],
      isError: true,
    });
  });

  it("gives the same error result for an API timeout, with HTTP 200", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchMock = stubHangingFetch();
    const { port } = await startTestServer();

    const memory = await afterApiTimeout(fetchMock, 1, overMemory("get_route", { id: 53914 }));
    const http = await afterApiTimeout(fetchMock, 2, overHttp(port, "get_route", { id: 53914 }));

    expect(http.status).toBe(200);
    expect(http.result).toEqual({
      content: [{ type: "text", text: "Error: Camptocamp API error: request timed out after 15 s" }],
      isError: true,
    });
    expect(http.result).toEqual(memory);
  });

  it("answers an API 500 with HTTP 200 and an isError result", async () => {
    stubFetch(serverError);
    const { port } = await startTestServer();

    const http = await overHttp(port, "get_route", { id: 53914 });

    expect(http.status).toBe(200);
    expect(http.result).toEqual({
      content: [
        {
          type: "text",
          text: "Error: Camptocamp API error: 500 Internal Server Error (route 53914): database unavailable",
        },
      ],
      isError: true,
    });
  });

  it("has an argument table entry for every registered tool", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(Object.keys(TOOL_ARGUMENTS).sort()).toEqual(tools.map((tool) => tool.name).sort());
  });

  it.each(API_500_CASES)("gives the same %s output for an API 500 with %j", async (name, args) => {
    const fetchMock = stubFetch(serverError);
    const result = await expectSameOutput(name, args);

    expect(fetchMock).toHaveBeenCalled();
    expect(result.content[0].text).toContain("Error: Camptocamp API error: 500 Internal Server Error");
    if (NEVER_AN_ERROR_RESULT.has(name)) {
      expect(result.isError).toBeUndefined();
    } else {
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/^Error: Camptocamp API error: 500 Internal Server Error/);
    }
  });
});
