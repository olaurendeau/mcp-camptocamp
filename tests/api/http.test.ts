import { describe, it, expect, vi, beforeEach } from "vitest";
import { BASE_URL, getJson } from "../../src/api/http.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

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

  it("throws 'Camptocamp API error: <status> <statusText>' without reading the body when the response is not ok", async () => {
    const json = vi.fn();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found", json });

    await expect(getJson({ path: "/routes/999999999" })).rejects.toThrow(
      new Error("Camptocamp API error: 404 Not Found"),
    );
    expect(json).not.toHaveBeenCalled();
  });
});
