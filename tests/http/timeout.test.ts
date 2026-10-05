import { ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../server/helpers.js";
import { configureUpstream, queuedUpstreamRequests } from "../../src/api/upstream.js";
import { TOOLS_LIST_BATCH, callTool, postMcp, rpc, slowReader, startTestServer } from "./helpers.js";

// AC5.2 on #277: a POST that has not finished within 90 s gets a 504, and whatever it was waiting for is cancelled.

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  configureUpstream(undefined);
});

const TIMED_OUT = { jsonrpc: "2.0", error: { code: -32000, message: "Request timed out after 90 s" }, id: null };

// Trimmed real GET /routes/53914?lang=fr.
const ROUTE_53914 = {
  document_id: 53914,
  locales: [{ lang: "fr", title: "Martine is on the rock", title_prefix: "Aiguille Dibona", summary: null }],
  activities: ["rock_climbing"],
  global_rating: "TD",
  elevation_max: 3131,
};

/** A fetch that never settles by itself, whatever its signal says: the test answers it, if ever, by hand. */
function neverSettlingFetch() {
  const answers: ((response: Response) => void)[] = [];
  let called!: () => void;
  const fetched = new Promise<void>((resolve) => (called = resolve));
  const fetchMock = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((resolve) => {
        answers.push(resolve);
        called();
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { answers, fetched };
}

function requestLines(logs: string[]): Record<string, unknown>[] {
  return logs.slice(1).map((line) => JSON.parse(line) as Record<string, unknown>); // logs[0] is the startup line
}

describe("HTTP request timeout (AC5.2)", () => {
  it("answers 504 after 90 s, aborts the request's context, and drops the late result", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { answers, fetched } = neverSettlingFetch();
    // fetchWithTimeout (src/api/http.ts) combines its own 15 s timer's signal with the request context's signal.
    const anySignal = vi.spyOn(AbortSignal, "any");
    const writeHead = vi.spyOn(ServerResponse.prototype, "writeHead");
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const server = await startTestServer();
      const call = postMcp(server.port, callTool("get_route", { id: 53914 }));
      await fetched;
      const contextSignal = anySignal.mock.calls[0][0][1];

      await vi.advanceTimersByTimeAsync(89_999);
      expect(contextSignal.aborted).toBe(false);
      expect(server.logs).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      const result = await call;

      expect(result.status).toBe(504);
      expect(result.headers.connection).toBe("close");
      expect(result.json).toEqual(TIMED_OUT);
      expect(contextSignal.aborted).toBe(true);

      // The upstream answer comes after all: the tool finishes, and its result goes nowhere.
      const late = jsonResponse(ROUTE_53914);
      answers[0](late);
      await vi.waitFor(() => {
        expect(late.bodyUsed).toBe(true);
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(writeHead).toHaveBeenCalledOnce();
      expect(requestLines(server.logs)).toEqual([
        expect.objectContaining({ status: 504, rpc: "tools/call", tool: "get_route", result: "rejected" }),
      ]);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("drops the request's queued Camptocamp requests at the 504", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { fetched } = neverSettlingFetch();
    configureUpstream({ concurrency: 1 });
    const server = await startTestServer();
    // The first ID holds the only slot for good; the others queue in pairs (3 at a time), each pair busy after
    // 20 s, so the 10th ID is still queued at 90 s.
    const ids = Array.from({ length: 10 }, (_, i) => 1924131 + i);
    const call = postMcp(server.port, callTool("get_outings", { ids }));
    await fetched;

    await vi.advanceTimersByTimeAsync(89_999);
    expect(queuedUpstreamRequests()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await call).status).toBe(504);
    expect(queuedUpstreamRequests()).toBe(0);
  });

  it("cuts a response its client stopped reading at 90 s, and logs it as 499", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const server = await startTestServer();
    const reader = await slowReader(server.port, TOOLS_LIST_BATCH);
    await reader.stalled;

    await vi.advanceTimersByTimeAsync(89_999);
    expect(server.logs).toHaveLength(1); // the response is still being written
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => {
      expect(server.logs).toHaveLength(2);
    });
    expect(requestLines(server.logs)).toEqual([
      expect.objectContaining({ status: 499, rpc: "batch", result: "rejected" }),
    ]);
    reader.socket.destroy();
  });

  it("never hands the SDK a request that timed out while its MCP server was connecting", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let connected!: () => void;
    const connecting = new Promise<void>((resolve) => (connected = resolve));
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    vi.spyOn(McpServer.prototype, "connect").mockImplementation(() => {
      entered();
      return connecting;
    });
    const close = vi.spyOn(McpServer.prototype, "close");
    const handleRequest = vi.spyOn(WebStandardStreamableHTTPServerTransport.prototype, "handleRequest");
    const server = await startTestServer();
    const call = postMcp(server.port, rpc("tools/list"));
    await reached;

    await vi.advanceTimersByTimeAsync(90_000);
    expect((await call).status).toBe(504);
    connected();
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledOnce(); // the request's MCP server is closed: its handling is over
    });

    expect(handleRequest).not.toHaveBeenCalled();
  });

  it("clears its timer once the response is sent", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const server = await startTestServer();
    const result = await postMcp(server.port, rpc("tools/list"));
    expect(result.status).toBe(200);
    await vi.waitFor(() => {
      expect(server.logs).toHaveLength(2);
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
