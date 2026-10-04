import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { BASE_URL, getJson } from "../../src/api/http.js";

// Any body passes: for the tests that are not about the response shape.
const anySchema = z.unknown();
const countSchema = z.object({ documents: z.array(z.object({ document_id: z.number() })), total: z.number() });

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

const TIMED_OUT = new Error("Camptocamp API error: request timed out after 15 s");

/** A fetch that never answers on its own and rejects like undici once its signal aborts. */
function fetchSettlingOnAbort(_url: string, init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
}

/** A response whose body streams nothing until the request signal aborts, then errors like undici. */
function responseStalledUntilAbort(init: RequestInit, responseInit: ResponseInit): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      init.signal?.addEventListener("abort", () => controller.error(init.signal?.reason));
    },
  });
  return new Response(body, responseInit);
}

function jsonResponse(body: unknown, init: ResponseInit): Response {
  return new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json" } });
}

describe("getJson", () => {
  it("fetches BASE_URL + path + params and returns the parsed body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ documents: [], total: 0 }, { status: 200 }));

    const result = await getJson({
      path: "/routes",
      params: new URLSearchParams({ q: "Mont Blanc", limit: "10" }),
      schema: countSchema,
    });

    expect(BASE_URL).toBe("https://api.camptocamp.org");
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.camptocamp.org/routes?q=Mont+Blanc&limit=10");
    expect(result.total).toBe(0);
  });

  it("omits the query string when there are no params", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, { status: 200 }));

    await getJson({ path: "/routes/123", schema: anySchema });

    expect(mockFetch.mock.calls[0][0]).toBe("https://api.camptocamp.org/routes/123");
  });

  it("throws 'Camptocamp API error: <status> <statusText>' when the error body has no description", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ status: "error", errors: [{ name: "Not Found" }] }, { status: 404, statusText: "Not Found" }),
    );

    await expect(getJson({ path: "/routes/999999999", schema: anySchema })).rejects.toThrow(
      new Error("Camptocamp API error: 404 Not Found"),
    );
  });
});

describe("getJson HTTP error messages", () => {
  it("names the requested document and gives the API description", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        { status: "error", errors: [{ location: "body", name: "Not Found", description: "document not found" }] },
        { status: 404, statusText: "Not Found" },
      ),
    );

    await expect(
      getJson({ path: "/routes/53914", document: { type: "route", id: 53914 }, schema: anySchema }),
    ).rejects.toThrow(new Error("Camptocamp API error: 404 Not Found (route 53914): document not found"));
  });

  it("joins several descriptions, collapses their whitespace and skips the unusable ones", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          status: "error",
          errors: [
            { name: "date", description: "  invalid\n  date " },
            { name: "limit" },
            { name: "offset", description: 42 },
            "not an object",
            { name: "a", description: "   " },
            { name: "pl", description: "unknown language" },
          ],
        },
        { status: 400, statusText: "Bad Request" },
      ),
    );

    await expect(getJson({ path: "/outings", schema: anySchema })).rejects.toThrow(
      new Error("Camptocamp API error: 400 Bad Request: invalid date; unknown language"),
    );
  });

  it.each([
    ["an empty body", ""],
    ["a JSON body without errors", JSON.stringify({ status: "error" })],
    ["a JSON body whose errors is not an array", JSON.stringify({ errors: "boom" })],
    ["a JSON null body", "null"],
    ["an HTML body", "<html><body><h1>Internal Server Error</h1></body></html>"],
  ])("gives only the status line for %s", async (_label, body) => {
    mockFetch.mockResolvedValueOnce(new Response(body, { status: 500, statusText: "Internal Server Error" }));

    await expect(getJson({ path: "/routes", schema: anySchema })).rejects.toThrow(
      new Error("Camptocamp API error: 500 Internal Server Error"),
    );
  });

  it("gives only the status line when the error body cannot be read", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: () => Promise.reject(new TypeError("terminated")),
    });

    await expect(getJson({ path: "/routes", schema: anySchema })).rejects.toThrow(
      new Error("Camptocamp API error: 502 Bad Gateway"),
    );
  });

  it("leaves out an empty status text", async () => {
    mockFetch.mockResolvedValueOnce(new Response("", { status: 503 }));

    await expect(
      getJson({ path: "/areas/14403", document: { type: "area", id: 14403 }, schema: anySchema }),
    ).rejects.toThrow(new Error("Camptocamp API error: 503 (area 14403)"));
  });

  it("cuts a long description to 200 characters without splitting a character", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ errors: [{ description: "𝄞".repeat(300) }] }, { status: 400, statusText: "Bad Request" }),
    );

    const error = await getJson({ path: "/routes", schema: anySchema }).catch((e: unknown) => e);

    const reason = (error as Error).message.replace("Camptocamp API error: 400 Bad Request: ", "");
    expect(reason).toBe(`${"𝄞".repeat(199)}…`);
    expect(Array.from(reason)).toHaveLength(200);
  });

  it("keeps a description of exactly 200 characters whole", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ errors: [{ description: "y".repeat(200) }] }, { status: 400, statusText: "Bad Request" }),
    );

    await expect(getJson({ path: "/routes", schema: anySchema })).rejects.toThrow(
      new Error(`Camptocamp API error: 400 Bad Request: ${"y".repeat(200)}`),
    );
  });
});

describe("getJson network errors", () => {
  it.each([
    [
      "the cause code",
      new TypeError("fetch failed", { cause: { code: "ECONNRESET", message: "reset" } }),
      "ECONNRESET",
    ],
    [
      "the cause message when there is no code",
      new TypeError("fetch failed", { cause: new Error("other side closed") }),
      "other side closed",
    ],
    ["the error message when the cause is unusable", new TypeError("fetch failed", { cause: "nope" }), "fetch failed"],
    [
      "the error message when there is no cause",
      new DOMException("This operation was aborted", "AbortError"),
      "This operation was aborted",
    ],
  ])("reports %s", async (_label, error, detail) => {
    mockFetch.mockRejectedValueOnce(error);

    await expect(getJson({ path: "/routes/1", document: { type: "route", id: 1 }, schema: anySchema })).rejects.toThrow(
      new Error(`Camptocamp API error: network error (${detail})`),
    );
  });
});

describe("getJson response validation", () => {
  it("returns the body parsed by the schema, without the keys the schema does not declare", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ documents: [{ document_id: 1, version: 3 }], total: 1, extra: true }, { status: 200 }),
    );

    const result = await getJson({ path: "/routes", schema: countSchema });

    expect(result).toEqual({ documents: [{ document_id: 1 }], total: 1 });
  });

  it.each([
    ["an HTML page", "<html><body>Maintenance</body></html>"],
    ["an empty body", ""],
    ["truncated JSON", '{"documents": ['],
  ])("reports %s as an unexpected response (not JSON)", async (_label, body) => {
    mockFetch.mockResolvedValueOnce(new Response(body, { status: 200, statusText: "OK" }));

    await expect(getJson({ path: "/routes", schema: countSchema })).rejects.toThrow(
      new Error("Camptocamp API error: unexpected response (not JSON)"),
    );
  });

  it.each([
    ["a missing field", { total: 0 }, "documents: Required"],
    [
      "a wrong type in a document",
      { documents: [{ document_id: "1" }], total: 1 },
      "documents.0.document_id: Expected number, received string",
    ],
    ["a body that is not an object", null, "Expected object, received null"],
  ])("reports %s with the path and message of the first issue", async (_label, body, detail) => {
    mockFetch.mockResolvedValueOnce(jsonResponse(body, { status: 200 }));

    await expect(getJson({ path: "/routes", schema: countSchema })).rejects.toThrow(
      new Error(`Camptocamp API error: unexpected response (${detail})`),
    );
  });
});

describe("getJson request headers", () => {
  it("sends the User-Agent with the package.json version and asks for JSON", async () => {
    const packageVersion = (
      JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }
    ).version;
    mockFetch.mockResolvedValueOnce(jsonResponse({}, { status: 200, statusText: "OK" }));

    await getJson({ path: "/routes/53914", schema: anySchema });

    const headers = new Headers((mockFetch.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get("User-Agent")).toBe(
      `mcp-camptocamp/${packageVersion} (+https://github.com/olaurendeau/mcp-camptocamp)`,
    );
    expect(headers.get("Accept")).toBe("application/json");
  });
});

describe("getJson timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts a fetch that never answers after 15 s and says it timed out", async () => {
    mockFetch.mockImplementationOnce(fetchSettlingOnAbort);
    let settled = false;
    const request = getJson({
      path: "/routes/53914",
      document: { type: "route", id: 53914 },
      schema: anySchema,
    }).finally(() => {
      settled = true;
    });
    const outcome = expect(request).rejects.toThrow(TIMED_OUT);

    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).toBe(false);
    expect((mockFetch.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await outcome;
    expect((mockFetch.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it("covers reading a successful body", async () => {
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) =>
      Promise.resolve(responseStalledUntilAbort(init, { status: 200, statusText: "OK" })),
    );
    const outcome = expect(getJson({ path: "/areas/14067", schema: anySchema })).rejects.toThrow(TIMED_OUT);

    await vi.advanceTimersByTimeAsync(15_000);

    await outcome;
  });

  it("covers reading an error body", async () => {
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) =>
      Promise.resolve(responseStalledUntilAbort(init, { status: 500, statusText: "Internal Server Error" })),
    );
    const outcome = expect(getJson({ path: "/routes", schema: anySchema })).rejects.toThrow(TIMED_OUT);

    await vi.advanceTimersByTimeAsync(15_000);

    await outcome;
  });

  it("clears the timer after a success", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ documents: [], total: 0 }, { status: 200, statusText: "OK" }));

    await getJson({ path: "/routes", schema: anySchema });

    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer after an HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(new Response("", { status: 503, statusText: "Service Unavailable" }));

    await expect(getJson({ path: "/routes", schema: anySchema })).rejects.toThrow("503");

    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer after a network error", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }));

    await expect(getJson({ path: "/routes", schema: anySchema })).rejects.toThrow("network error (ECONNRESET)");

    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["a body that is not JSON", new Response("<html></html>", { status: 200, statusText: "OK" })],
    ["a body of the wrong shape", jsonResponse({ total: 0 }, { status: 200, statusText: "OK" })],
  ])("clears the timer after %s", async (_label, response) => {
    mockFetch.mockResolvedValueOnce(response);

    await expect(getJson({ path: "/routes", schema: countSchema })).rejects.toThrow("unexpected response");

    expect(vi.getTimerCount()).toBe(0);
  });
});
