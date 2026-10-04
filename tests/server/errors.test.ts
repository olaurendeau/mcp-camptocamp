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

    expect(text).toMatch(/^Error: Camptocamp API error: 404/);
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
