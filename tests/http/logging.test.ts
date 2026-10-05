import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../server/helpers.js";
import { HOST, MCP_HEADERS, TOKEN, callTool, postMcp, rpc, send, startTestServer } from "./helpers.js";

// AC4.4 and AC6.1 to AC6.3 on #277: one JSON line on stderr per HTTP request, and nothing a client sent or
// received in it beyond the method, the path and the JSON-RPC and tool names.

afterEach(() => {
  vi.restoreAllMocks();
});

type Line = Record<string, unknown>;

/** Waits for `count` request lines after the startup line, and returns them parsed. */
async function requestLines(logs: string[], count: number): Promise<Line[]> {
  await vi.waitFor(() => {
    expect(logs).toHaveLength(1 + count);
  });
  return logs.slice(1).map((line) => {
    expect(line).not.toContain("\n");
    return JSON.parse(line) as Line;
  });
}

// Body of the live GET /outings/999999999 response.
const NOT_FOUND = () =>
  jsonResponse(
    { status: "error", errors: [{ location: "body", name: "Not Found", description: "document not found" }] },
    { status: 404, statusText: "Not Found" },
  );

const SERVER_ERROR = () =>
  jsonResponse(
    { status: "error", errors: [{ location: "body", name: "Internal Server Error", description: "db down" }] },
    { status: 500, statusText: "Internal Server Error" },
  );

// Trimmed real GET /routes?q=gamma&limit=10&lang=fr: the second document has no title_prefix nor rating.
const GAMMA_SEARCH = {
  total: 2,
  documents: [
    {
      document_id: 57842,
      locales: [{ lang: "fr", title: "Voie Gamma", title_prefix: "Barre des Écrins" }],
      activities: ["mountain_climbing"],
      elevation_max: 4102,
      global_rating: "ED",
    },
    { document_id: 1148298, locales: [{ lang: "fr", title: "Gamma « directe »" }], activities: ["rock_climbing"] },
  ],
};

function stubFetch(respond: () => Response) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(respond()));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("HTTP request log", () => {
  it("writes one line per request with every AC6.1 field", async () => {
    stubFetch(NOT_FOUND);
    const other = "f".repeat(64);
    const server = await startTestServer({ tokens: [other, TOKEN] });

    await postMcp(server.port, callTool("get_outings", { ids: [999999998, 999999999] }));
    await send(server.port, { method: "GET", path: "/healthz" });

    const [call, health] = await requestLines(server.logs, 2);
    expect(call).toEqual({
      time: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/) as unknown,
      method: "POST",
      path: "/mcp",
      status: 200,
      duration_ms: expect.any(Number) as unknown,
      rpc: "tools/call",
      tool: "get_outings",
      result: "ok", // get_outings prints an unreadable ID's error in its block, without isError
      upstream_requests: 2,
      token: 2,
    });
    expect(health).toMatchObject({ method: "GET", path: "/healthz", status: 200, rpc: null, tool: null });
    expect(health).toMatchObject({ result: "ok", upstream_requests: 0, token: null });
  });

  it.each([
    [
      "a tool error",
      callTool("get_route", { id: 53914 }),
      { rpc: "tools/call", tool: "get_route", result: "tool_error" },
    ],
    ["a JSON-RPC error", rpc("no/such_method"), { rpc: "no/such_method", tool: null, result: "rejected" }],
    ["an odd method name", rpc("tools list!"), { rpc: "invalid", tool: null, result: "rejected" }],
    ["an odd tool name", callTool("get route", {}), { rpc: "tools/call", tool: "invalid", result: "tool_error" }],
    [
      "a batch with a tool error",
      [rpc("tools/list"), callTool("get_route", { id: 1 }, 2)],
      { rpc: "batch", result: "tool_error" },
    ],
    [
      "a batch with an error",
      [callTool("get_route", { id: 1 }), rpc("no/such_method", {}, 2)],
      { rpc: "batch", result: "rejected" },
    ],
    ["a notification", { jsonrpc: "2.0", method: "notifications/initialized" }, { status: 202, result: "ok" }],
  ])("logs %s", async (_case, message, expected) => {
    stubFetch(SERVER_ERROR);
    const server = await startTestServer();
    await postMcp(server.port, message);
    const [line] = await requestLines(server.logs, 1);
    expect(line).toMatchObject({ status: 200, ...expected });
  });

  it.each([
    ["Host", { host: "evil.example" }, { rejected_host: "evil.example" }],
    ["Origin", { host: HOST, origin: "https://evil.example" }, { rejected_origin: "https://evil.example" }],
    ["Host, cut to 200 characters,", { host: `${"h".repeat(300)}.example` }, { rejected_host: "h".repeat(200) }],
  ])("names the refused %s in a 403 line (AC4.4)", async (_case, headers, expected) => {
    const server = await startTestServer();
    await send(server.port, { headers, body: "{}" });
    const [line] = await requestLines(server.logs, 1);
    expect(line).toMatchObject({ status: 403, result: "rejected", token: null, ...expected });
  });

  it("logs malformed JSON as status 400, without the body (AC6.3)", async () => {
    const server = await startTestServer();
    await send(server.port, { headers: MCP_HEADERS, body: '{"jsonrpc":"2.0","method":"SECRET-BODY' });
    const [line] = await requestLines(server.logs, 1);
    expect(line).toMatchObject({ status: 400, rpc: null, tool: null, result: "rejected", token: 1 });
    expect(server.logs.join("\n")).not.toContain("SECRET-BODY");
  });

  it("logs a client that went away before its response as status 499", async () => {
    let called!: () => void;
    const fetched = new Promise<void>((resolve) => (called = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(init.signal?.reason as Error); // like undici
            });
            called();
          }),
      ),
    );
    const server = await startTestServer();
    const req = httpRequest({
      host: "127.0.0.1",
      port: server.port,
      method: "POST",
      path: "/mcp",
      headers: MCP_HEADERS,
    });
    req.on("error", () => undefined); // destroyed below
    req.end(JSON.stringify(callTool("get_route", { id: 53914 })));
    await fetched;
    req.destroy();

    const [line] = await requestLines(server.logs, 1);
    expect(line).toMatchObject({ status: 499, rpc: "tools/call", tool: "get_route", result: "rejected" });
    expect(line).toMatchObject({ upstream_requests: 1, token: 1 });
  });

  it("never logs an argument, a token, the query string, the response or the client's address (AC6.2)", async () => {
    stubFetch(() => jsonResponse(GAMMA_SEARCH));
    const token = "T0KEN-5c1e9a7b3d2f48e6a0b4c8d2e6f1a3b5c7d9e0f2";
    const wrongToken = "T0KEN-9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d";
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    });
    const server = await startTestServer({ tokens: [token] });

    const call = await send(server.port, {
      path: "/mcp?x=SECRET-QS",
      headers: { ...MCP_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify(callTool("search_routes", { query: "SECRET-ARG-7f3a" })),
    });
    const refused = await postMcp(server.port, rpc("tools/list"), { authorization: `Bearer ${wrongToken}` });
    expect(refused.status).toBe(401);
    // A client configured with the token in the URL path, as some put it in a secret URL.
    const inPath = await send(server.port, { method: "GET", path: `/mcp/${token}`, headers: { host: HOST } });
    expect(inPath.status).toBe(404);

    const lines = await requestLines(server.logs, 3);
    expect(lines[0]).toMatchObject({ path: "/mcp", status: 200, rpc: "tools/call", tool: "search_routes", token: 1 });
    expect(lines[1]).toMatchObject({ status: 401, result: "rejected", token: null });
    expect(lines[2]).toMatchObject({ path: "other", status: 404, result: "rejected" });
    const responseText = (JSON.parse(call.body) as { result: { content: { text: string }[] } }).result.content[0].text;
    expect(responseText).toContain("Voie Gamma");

    // Every line, the startup one included; only the bind host is left out, being this test's client address too.
    const startup = { ...(JSON.parse(server.logs[0]) as Record<string, unknown>), host: undefined };
    const written = [JSON.stringify(startup), ...server.logs.slice(1), ...stderr].join("\n");
    const forbidden = ["SECRET-ARG-7f3a", "SECRET-QS", responseText, "Voie Gamma", "127.0.0.1"];
    for (const secret of [token, wrongToken]) {
      for (let start = 0; start + 8 <= secret.length; start++) forbidden.push(secret.slice(start, start + 8));
    }
    for (const value of forbidden) expect(written).not.toContain(value);
  });
});
