import { describe, it, expect, vi, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connect, jsonResponse, stubFetch } from "./helpers.js";

// Body of the live GET /routes/999999999 response; every missing ID or wrong type answers the same.
const NOT_FOUND_BODY = {
  status: "error",
  errors: [{ location: "body", name: "Not Found", description: "document not found" }],
};

function apiError(description: string, status: number, statusText: string): Response {
  return jsonResponse(
    { status: "error", errors: [{ location: "querystring", name: "offset", description }] },
    { status, statusText },
  );
}

async function callForText(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, name).toBe(true);
  const content = result.content as Array<{ type: string; text: string }>;
  expect(content).toHaveLength(1);
  expect(content[0].type).toBe("text");
  return content[0].text;
}

describe("upstream HTTP errors", () => {
  const detailTools = [
    { name: "get_route", type: "route" },
    { name: "get_waypoint", type: "waypoint" },
    { name: "get_outing", type: "outing" },
    { name: "get_area", type: "area" },
    { name: "get_book", type: "book" },
    { name: "get_article", type: "article" },
  ];

  it.each(detailTools)("$name names the $type, its ID and the API reason on a 404", async ({ name, type }) => {
    stubFetch(jsonResponse(NOT_FOUND_BODY, { status: 404, statusText: "Not Found" }));
    const client = await connect();

    const text = await callForText(client, name, { id: 999999999 });

    expect(text).toBe(`Error: Camptocamp API error: 404 Not Found (${type} 999999999): document not found`);
  });

  it("gives the API reason of a search_outings 400 verbatim", async () => {
    stubFetch(apiError("offset + limit greater than 10000", 400, "Bad Request"));
    const client = await connect();

    const text = await callForText(client, "search_outings", { offset: 9990, limit: 10 });

    expect(text).toBe("Error: Camptocamp API error: 400 Bad Request: offset + limit greater than 10000");
  });

  it("gives only the status line when the error body is HTML", async () => {
    // The API answers an oversized query string with an HTML page
    stubFetch(
      new Response("<html><head><title>400 Bad Request</title></head><body><h1>Bad Request</h1></body></html>", {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "text/html" },
      }),
    );
    const client = await connect();

    const text = await callForText(client, "search_routes", { query: "gamma" });

    expect(text).toBe("Error: Camptocamp API error: 400 Bad Request");
    expect(text).not.toContain("<");
  });

  it("cuts an API reason longer than 200 characters", async () => {
    stubFetch(apiError("x".repeat(1000), 500, "Internal Server Error"));
    const client = await connect();

    const text = await callForText(client, "search_outings", {});

    const prefix = "Error: Camptocamp API error: 500 Internal Server Error: ";
    expect(text.startsWith(prefix)).toBe(true);
    const reason = text.slice(prefix.length);
    expect(reason.length).toBeLessThanOrEqual(200);
    expect(reason).toBe(`${"x".repeat(199)}…`);
  });
});

describe("network errors", () => {
  it("names the network failure code instead of 'fetch failed'", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }));
    const client = await connect();

    const text = await callForText(client, "get_route", { id: 53914 });

    expect(text).toMatch(/^Error: Camptocamp API error:/);
    expect(text).toContain("ENOTFOUND");
    expect(text).toBe("Error: Camptocamp API error: network error (ENOTFOUND)");
  });

  it("reports a fetch rejecting with a plain string as a network error", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockRejectedValueOnce("socket hang up");
    const client = await connect();

    const text = await callForText(client, "search_routes", { query: "gamma" });

    expect(text).toBe("Error: Camptocamp API error: network error (socket hang up)");
  });
});

// Trimmed real GET /routes?q=gamma&pl=fr document: the API also sends keys no formatter reads.
const GAMMA_SEARCH_DOCUMENT = {
  document_id: 57842,
  version: 14,
  protected: false,
  type: "r",
  available_langs: ["fr", "es"],
  locales: [{ lang: "fr", title: "Voie Gamma", title_prefix: "Barre des Écrins", version: 6, topic_id: null }],
  activities: ["mountain_climbing"],
  elevation_max: 4102,
  height_diff_difficulties: 1100,
  global_rating: "ED",
  rock_free_rating: "6b+",
  quality: "fine",
};

// Trimmed real GET /routes/53914: unset values come as null.
const ROUTE_53914 = {
  document_id: 53914,
  version: 9,
  locales: [
    { lang: "fr", title: "Martine is on the rock", title_prefix: "Aiguille Dibona", description: "Belle voie." },
  ],
  activities: ["rock_climbing"],
  elevation_max: 3131,
  height_diff_down: null,
  global_rating: "TD",
  rock_free_rating: "6a",
  geometry: { version: 12, geom_detail: null },
  areas: [
    { document_id: 14403, locales: [{ lang: "fr", title: "Écrins" }], area_type: "range", available_langs: null },
  ],
};

describe("malformed 200 responses", () => {
  function expectUnexpected(text: string) {
    expect(text.startsWith("Error: Camptocamp API error:")).toBe(true);
    expect(text).toContain("unexpected response");
    expect(text).not.toContain("Cannot read properties");
  }

  it("reports a body that is not JSON", async () => {
    stubFetch(new Response("<html><body>Maintenance</body></html>", { status: 200, statusText: "OK" }));
    const client = await connect();

    const text = await callForText(client, "search_routes", { query: "gamma" });

    expectUnexpected(text);
    expect(text).toBe("Error: Camptocamp API error: unexpected response (not JSON)");
  });

  it("reports a search response without documents", async () => {
    stubFetch(jsonResponse({ total: 1 }));
    const client = await connect();

    const text = await callForText(client, "search_routes", { query: "gamma" });

    expectUnexpected(text);
    expect(text).toBe("Error: Camptocamp API error: unexpected response (documents: Required)");
  });

  it("reports a route without locales", async () => {
    stubFetch(jsonResponse({ ...ROUTE_53914, locales: undefined }));
    const client = await connect();

    const text = await callForText(client, "get_route", { id: 53914 });

    expectUnexpected(text);
    expect(text).toBe("Error: Camptocamp API error: unexpected response (locales: Required)");
  });

  it("reports a search document whose activities is not an array", async () => {
    stubFetch(jsonResponse({ documents: [{ ...GAMMA_SEARCH_DOCUMENT, activities: "mountain_climbing" }], total: 1 }));
    const client = await connect();

    const text = await callForText(client, "search_routes", { query: "gamma" });

    expectUnexpected(text);
    expect(text).toBe(
      "Error: Camptocamp API error: unexpected response (documents.0.activities: Expected array, received string)",
    );
  });
});

describe("unknown extra fields", () => {
  async function callForOutput(name: string, args: Record<string, unknown>, body: unknown) {
    stubFetch(jsonResponse(body));
    const client = await connect();
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, name).toBeFalsy();
    return (result.content as Array<{ type: string; text: string }>)[0].text;
  }

  it("change nothing in search_routes, at top level or in a document", async () => {
    const plain = await callForOutput(
      "search_routes",
      { query: "gamma" },
      { documents: [GAMMA_SEARCH_DOCUMENT], total: 1 },
    );
    const extended = await callForOutput(
      "search_routes",
      { query: "gamma" },
      { documents: [{ ...GAMMA_SEARCH_DOCUMENT, new_field: { nested: [1, 2] } }], total: 1, facets: { act: 3 } },
    );

    expect(plain).toContain("Voie Gamma");
    expect(extended).toBe(plain);
  });

  it("change nothing in get_route, at top level or in a nested area", async () => {
    const plain = await callForOutput("get_route", { id: 53914 }, ROUTE_53914);
    const extended = await callForOutput(
      "get_route",
      { id: 53914 },
      {
        ...ROUTE_53914,
        cooked: { fr: "<p>html</p>" },
        areas: ROUTE_53914.areas.map((area) => ({ ...area, protected: false, type: "a" })),
      },
    );

    expect(plain).toContain("Martine is on the rock");
    expect(extended).toBe(plain);
  });
});

describe("malformed author", () => {
  // A GET /outings/{id} body whose author lacks its user_id.
  const outing = {
    document_id: 1630012,
    version: 2,
    locales: [{ lang: "fr", title: "Arête des Cosmiques", conditions: "Bonne trace." }],
    activities: ["mountain_climbing"],
    date_start: "2024-07-14",
    date_end: "2024-07-14",
    author: { name: "Jean Dupont" },
  };

  it("is left out of get_outing, which still shows the outing", async () => {
    stubFetch(jsonResponse(outing));
    const client = await connect();

    const result = await client.callTool({ name: "get_outing", arguments: { id: 1630012 } });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Arête des Cosmiques");
    expect(text).toContain("Bonne trace.");
    expect(text).not.toContain("Author");
    expect(text).not.toContain("undefined");
  });
});

describe("timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ends a never-answering request in an error result after 15 s", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const client = await connect();
    vi.useFakeTimers();

    const call = callForText(client, "get_route", { id: 53914 });
    await vi.advanceTimersByTimeAsync(15_000);
    const text = await call;

    expect(text).toBe("Error: Camptocamp API error: request timed out after 15 s");
  });
});

describe("non-Error throws", () => {
  afterEach(() => {
    vi.doUnmock("../../src/api/http.js");
    vi.resetModules();
  });

  it("are turned into an error result with their string form", async () => {
    vi.resetModules();
    vi.doMock("../../src/api/http.js", () => ({
      getJson: () => Promise.reject("upstream exploded"),
    }));
    const { createServer } = await import("../../src/server.js");
    const client = await connect(createServer());

    const text = await callForText(client, "get_route", { id: 53914 });

    expect(text).toBe("Error: upstream exploded");
  });
});
