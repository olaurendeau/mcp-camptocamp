import { describe, it, expect, vi, beforeEach } from "vitest";
import { BASE_URL, getJson } from "../../src/api/http.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function jsonResponse(body: unknown, init: ResponseInit): Response {
  return new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json" } });
}

describe("getJson", () => {
  it("fetches BASE_URL + path + params and returns the parsed body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ documents: [], total: 0 }),
    });

    const result = await getJson<{ total: number }>({
      path: "/routes",
      params: new URLSearchParams({ q: "Mont Blanc", limit: "10" }),
    });

    expect(BASE_URL).toBe("https://api.camptocamp.org");
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.camptocamp.org/routes?q=Mont+Blanc&limit=10");
    expect(result.total).toBe(0);
  });

  it("omits the query string when there are no params", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK", json: () => Promise.resolve({}) });

    await getJson({ path: "/routes/123" });

    expect(mockFetch.mock.calls[0][0]).toBe("https://api.camptocamp.org/routes/123");
  });

  it("throws 'Camptocamp API error: <status> <statusText>' when the error body has no description", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ status: "error", errors: [{ name: "Not Found" }] }, { status: 404, statusText: "Not Found" }),
    );

    await expect(getJson({ path: "/routes/999999999" })).rejects.toThrow(
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

    await expect(getJson({ path: "/routes/53914", document: { type: "route", id: 53914 } })).rejects.toThrow(
      new Error("Camptocamp API error: 404 Not Found (route 53914): document not found"),
    );
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

    await expect(getJson({ path: "/outings" })).rejects.toThrow(
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

    await expect(getJson({ path: "/routes" })).rejects.toThrow(
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

    await expect(getJson({ path: "/routes" })).rejects.toThrow(new Error("Camptocamp API error: 502 Bad Gateway"));
  });

  it("leaves out an empty status text", async () => {
    mockFetch.mockResolvedValueOnce(new Response("", { status: 503 }));

    await expect(getJson({ path: "/areas/14403", document: { type: "area", id: 14403 } })).rejects.toThrow(
      new Error("Camptocamp API error: 503 (area 14403)"),
    );
  });

  it("cuts a long description to 200 characters without splitting a character", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ errors: [{ description: "𝄞".repeat(300) }] }, { status: 400, statusText: "Bad Request" }),
    );

    const error = await getJson({ path: "/routes" }).catch((e: unknown) => e);

    const reason = (error as Error).message.replace("Camptocamp API error: 400 Bad Request: ", "");
    expect(reason).toBe(`${"𝄞".repeat(199)}…`);
    expect(Array.from(reason)).toHaveLength(200);
  });

  it("keeps a description of exactly 200 characters whole", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ errors: [{ description: "y".repeat(200) }] }, { status: 400, statusText: "Bad Request" }),
    );

    await expect(getJson({ path: "/routes" })).rejects.toThrow(
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

    await expect(getJson({ path: "/routes/1", document: { type: "route", id: 1 } })).rejects.toThrow(
      new Error(`Camptocamp API error: network error (${detail})`),
    );
  });
});
