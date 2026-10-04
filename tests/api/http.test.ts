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
    init.signal?.addEventListener("abort", () => {
      reject(init.signal?.reason as Error);
    });
  });
}

/** A response whose body streams nothing until the request signal aborts, then errors like undici. */
function responseStalledUntilAbort(init: RequestInit, responseInit: ResponseInit): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      init.signal?.addEventListener("abort", () => {
        controller.error(init.signal?.reason);
      });
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
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new TypeError("terminated"));
      },
    });
    mockFetch.mockResolvedValueOnce(new Response(body, { status: 502, statusText: "Bad Gateway" }));

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
  ])("reports %s, and keeps the fetch error as the cause", async (_label, error, detail) => {
    mockFetch.mockRejectedValueOnce(error);
    const request = getJson({ path: "/routes/1", document: { type: "route", id: 1 }, schema: anySchema });

    await expect(request).rejects.toThrow(new Error(`Camptocamp API error: network error (${detail})`));
    const failure = await request.catch((reason: unknown) => reason);
    expect((failure as Error).cause).toBe(error);
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

const MiB = 1024 * 1024;
const TOO_LARGE = new Error("Camptocamp API error: response too large (over 10 MiB)");

/** A body that produces nothing until read: a pull spy shows whether it was read. */
function lazyBody(
  pull: (controller: ReadableStreamDefaultController<Uint8Array>) => void,
  cancel: () => Promise<void> = () => Promise.resolve(),
) {
  const pullSpy = vi.fn(pull);
  const cancelSpy = vi.fn(cancel);
  // highWaterMark 0: the stream does not pull ahead on its own, only when the reader asks
  const stream = new ReadableStream<Uint8Array>({ pull: pullSpy, cancel: cancelSpy }, { highWaterMark: 0 });
  return { stream, pullSpy, cancelSpy };
}

/** A 20 MiB body streamed lazily in 1 MiB chunks, like a gzip/chunked response without Content-Length. */
function twentyMiBInChunks(cancel?: () => Promise<void>) {
  let sent = 0;
  return lazyBody((controller) => {
    if (sent === 20) {
      controller.close();
      return;
    }
    sent += 1;
    controller.enqueue(new Uint8Array(MiB).fill(0x20));
  }, cancel);
}

/** A cancel that fails, like a connection already torn down: cancel() then rejects with this error. */
const failingCancel = () => Promise.reject(new Error("socket hang up"));

/** A JSON body of exactly `bytes` bytes: {"x":"aaa…"}. */
function jsonOfSize(bytes: number): string {
  return `{"x":"${"a".repeat(bytes - '{"x":""}'.length)}"}`;
}

describe("getJson response size cap", () => {
  it("rejects a Content-Length over 10 MiB without reading the body", async () => {
    const { stream, pullSpy, cancelSpy } = lazyBody((controller) => {
      controller.close();
    });
    mockFetch.mockResolvedValueOnce(
      new Response(stream, { status: 200, statusText: "OK", headers: { "Content-Length": String(20 * MiB) } }),
    );

    await expect(getJson({ path: "/areas/14067", schema: anySchema })).rejects.toThrow(TOO_LARGE);

    expect(pullSpy).not.toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalledOnce();
  });

  it("rejects a streamed body without Content-Length once it goes over 10 MiB and cancels the reader", async () => {
    const { stream, pullSpy, cancelSpy } = twentyMiBInChunks();
    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 200, statusText: "OK" }));

    await expect(getJson({ path: "/areas/14067", schema: anySchema })).rejects.toThrow(TOO_LARGE);

    expect(pullSpy).toHaveBeenCalledTimes(11);
    expect(cancelSpy).toHaveBeenCalledOnce();
  });

  it("still says too large when cancelling a body refused by its Content-Length fails", async () => {
    const { stream, pullSpy, cancelSpy } = lazyBody((controller) => {
      controller.close();
    }, failingCancel);
    mockFetch.mockResolvedValueOnce(
      new Response(stream, { status: 200, statusText: "OK", headers: { "Content-Length": String(20 * MiB) } }),
    );

    await expect(getJson({ path: "/areas/14067", schema: anySchema })).rejects.toThrow(TOO_LARGE);

    expect(pullSpy).not.toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalledOnce();
  });

  it("still says too large when cancelling a streamed body over 10 MiB fails", async () => {
    const { stream, pullSpy, cancelSpy } = twentyMiBInChunks(failingCancel);
    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 200, statusText: "OK" }));

    await expect(getJson({ path: "/areas/14067", schema: anySchema })).rejects.toThrow(TOO_LARGE);

    expect(pullSpy).toHaveBeenCalledTimes(11);
    expect(cancelSpy).toHaveBeenCalledOnce();
  });

  it("counts the bytes read, not the Content-Length announced", async () => {
    const { stream, cancelSpy } = twentyMiBInChunks();
    mockFetch.mockResolvedValueOnce(
      new Response(stream, { status: 200, statusText: "OK", headers: { "Content-Length": "1000" } }),
    );

    await expect(getJson({ path: "/areas/14067", schema: anySchema })).rejects.toThrow(TOO_LARGE);

    expect(cancelSpy).toHaveBeenCalledOnce();
  });

  it("rejects a body one byte over 10 MiB", async () => {
    mockFetch.mockResolvedValueOnce(new Response(jsonOfSize(10 * MiB + 1), { status: 200, statusText: "OK" }));

    await expect(getJson({ path: "/areas/14067", schema: anySchema })).rejects.toThrow(TOO_LARGE);
  });

  it("parses a body of exactly 10 MiB with the matching Content-Length", async () => {
    const body = jsonOfSize(10 * MiB);
    mockFetch.mockResolvedValueOnce(
      new Response(body, { status: 200, statusText: "OK", headers: { "Content-Length": String(10 * MiB) } }),
    );

    const result = await getJson({ path: "/areas/14067", schema: z.object({ x: z.string() }) });

    expect(result.x).toHaveLength(10 * MiB - '{"x":""}'.length);
  });

  it("decodes UTF-8 characters split across chunks", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ title: "Aiguille du Goûter 𝄞" }));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    mockFetch.mockResolvedValueOnce(new Response(body, { status: 200, statusText: "OK" }));

    await expect(getJson({ path: "/waypoints/1", schema: anySchema })).resolves.toEqual({
      title: "Aiguille du Goûter 𝄞",
    });
  });

  it("reads a response without a body as an empty one", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200, statusText: "OK" }));

    await expect(getJson({ path: "/routes", schema: anySchema })).rejects.toThrow(
      new Error("Camptocamp API error: unexpected response (not JSON)"),
    );
  });

  it("keeps the status of an error whose Content-Length is over 10 MiB, without reading the body", async () => {
    const { stream, pullSpy, cancelSpy } = lazyBody((controller) => {
      controller.close();
    });
    mockFetch.mockResolvedValueOnce(
      new Response(stream, {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "Content-Length": String(20 * MiB) },
      }),
    );

    await expect(getJson({ path: "/routes", schema: anySchema })).rejects.toThrow(
      new Error("Camptocamp API error: 500 Internal Server Error: error body too large (over 10 MiB)"),
    );
    expect(pullSpy).not.toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalledOnce();
  });

  it("keeps the status of an error whose streamed body goes over 10 MiB and cancels the reader", async () => {
    const { stream, pullSpy, cancelSpy } = twentyMiBInChunks();
    mockFetch.mockResolvedValueOnce(new Response(stream, { status: 404, statusText: "Not Found" }));

    await expect(getJson({ path: "/routes/1", document: { type: "route", id: 1 }, schema: anySchema })).rejects.toThrow(
      new Error("Camptocamp API error: 404 Not Found (route 1): error body too large (over 10 MiB)"),
    );
    expect(pullSpy).toHaveBeenCalledTimes(11);
    expect(cancelSpy).toHaveBeenCalledOnce();
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

  it("aborts a fetch that never answers after 15 s and says it timed out, the abort as the cause", async () => {
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
    const signal = (mockFetch.mock.calls[0][1] as RequestInit).signal;
    expect(signal?.aborted).toBe(true);
    // The aborted fetch first fails as a network error, which the timeout error then wraps.
    const failure = await request.catch((reason: unknown) => reason);
    const cause = (failure as Error).cause;
    expect(cause).toEqual(new Error("Camptocamp API error: network error (This operation was aborted)"));
    expect((cause as Error).cause).toBe(signal?.reason);
  });

  it("covers reading a successful body", async () => {
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) =>
      Promise.resolve(responseStalledUntilAbort(init, { status: 200, statusText: "OK" })),
    );
    const outcome = expect(getJson({ path: "/areas/14067", schema: anySchema })).rejects.toThrow(TIMED_OUT);

    await vi.advanceTimersByTimeAsync(15_000);

    await outcome;
  });

  it("covers reading an error body and keeps its status", async () => {
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) =>
      Promise.resolve(responseStalledUntilAbort(init, { status: 404, statusText: "Not Found" })),
    );
    const outcome = expect(
      getJson({ path: "/routes/1", document: { type: "route", id: 1 }, schema: anySchema }),
    ).rejects.toThrow(
      new Error(
        "Camptocamp API error: 404 Not Found (route 1): request timed out after 15 s while reading the error body",
      ),
    );

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

  it("clears the timer after a body over 10 MiB", async () => {
    mockFetch.mockResolvedValueOnce(new Response(twentyMiBInChunks().stream, { status: 200, statusText: "OK" }));

    await expect(getJson({ path: "/routes", schema: anySchema })).rejects.toThrow(TOO_LARGE);

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
