import { request as httpRequest } from "node:http";
import { afterEach, describe, it, expect, vi } from "vitest";
import { getJson } from "../../src/api/http.js";
import { BUSY_MESSAGE, userAgent } from "../../src/api/upstream.js";
import type { Env } from "../../src/http/config.js";
import { runHttp, type HttpProcess } from "../../src/http/main.js";
import type { RunningHttpServer } from "../../src/http/server.js";
import { VERSION } from "../../src/version.js";
import { z } from "zod";
import { jsonResponse } from "../server/helpers.js";
import { HOST, MCP_HEADERS, TOKEN, callTool, freePort, postMcp } from "./helpers.js";

// AC7.1–AC7.3 of #277 end to end: the HTTP mode as src/index.ts starts it (runHttp), real HTTP requests, and a
// stubbed fetch standing in for the Camptocamp API.

const REPOSITORY = "https://github.com/olaurendeau/mcp-camptocamp";
const STDIO_USER_AGENT = `mcp-camptocamp/${VERSION} (+${REPOSITORY})`;

// Mirrors GET /routes/{id}?lang=fr, trimmed to a few fields get_route prints (no description, no associations).
function routeDocument(id: number) {
  return {
    document_id: id,
    locales: [{ lang: "fr", title: `Voie ${String(id)}` }],
    activities: ["rock_climbing"],
    global_rating: "AD",
    elevation_max: 3842,
  };
}

function routeId(input: Parameters<typeof fetch>[0]): number {
  return Number(new URL(input instanceof Request ? input.url : input).pathname.split("/")[2]);
}

const running: RunningHttpServer[] = [];

// Registered after the helpers' hook, so it runs first: every server stops while fetch is still stubbed.
afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.shutdown()));
});

/** Runs the HTTP mode on a free port with the test token and Host, plus `env`. */
async function startHttp(env: Env = {}): Promise<RunningHttpServer> {
  const port = await freePort();
  let stderr = "";
  const proc: HttpProcess = {
    env: {
      MCP_TRANSPORT: "http",
      MCP_AUTH_TOKENS: TOKEN,
      MCP_ALLOWED_HOSTS: HOST,
      MCP_HTTP_PORT: String(port),
      ...env,
    },
    stderr: { write: (text: string) => (stderr += text) },
    exit: (code) => {
      throw new Error(`exit ${String(code)}: ${stderr}`);
    },
    on: () => undefined,
  };
  const server = await runHttp(proc);
  if (!server) throw new Error(stderr);
  running.push(server);
  return server;
}

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

async function callForResult(port: number, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const { json } = await postMcp(port, callTool(name, args));
  return (json as { result: ToolResult }).result;
}

/** A fetch stub that holds every call until `release()`; later calls then answer at once. */
function heldFetch() {
  const held: (() => void)[] = [];
  let released = false;
  const fetchMock = vi.fn<typeof fetch>(
    (url, init) =>
      new Promise<Response>((resolve, reject) => {
        const answer = () => {
          resolve(jsonResponse(routeDocument(routeId(url))));
        };
        if (released) answer();
        else held.push(answer);
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          reject(signal.reason as Error); // like undici
        });
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    release: () => {
      released = true;
      held.splice(0).forEach((answer) => {
        answer();
      });
    },
  };
}

/** Starts a POST of `message` that the test can cut off before the response, as a client going away would. */
function openPost(port: number, message: unknown): { disconnect: () => void } {
  const req = httpRequest({
    host: "127.0.0.1",
    port,
    method: "POST",
    path: "/mcp",
    headers: MCP_HEADERS,
    agent: false,
  });
  req.on("error", () => undefined); // the test destroys it
  req.end(JSON.stringify(message));
  return { disconnect: () => req.destroy() };
}

describe("HTTP mode upstream cap (AC7.1)", () => {
  it.each([
    { env: {}, cap: 4 },
    { env: { MCP_UPSTREAM_CONCURRENCY: "2" }, cap: 2 },
  ])("never has more than $cap Camptocamp requests pending for 20 simultaneous get_route", async ({ env, cap }) => {
    let pending = 0;
    let maxPending = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        pending++;
        maxPending = Math.max(maxPending, pending);
        await new Promise((resolve) => setTimeout(resolve, 20));
        pending--;
        return jsonResponse(routeDocument(routeId(url)));
      }),
    );
    const { port } = await startHttp(env);

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => callForResult(port, "get_route", { id: 100 + i })),
    );

    expect(maxPending).toBe(cap);
    results.forEach((result, i) => {
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain(`# Voie ${String(100 + i)} (ID: ${String(100 + i)})`);
    });
  });
});

describe("HTTP mode busy error (AC7.2)", () => {
  it("answers a tool call with the busy message once 1 request is in flight and 50 wait", async () => {
    const { fetchMock, release } = heldFetch();
    const { port } = await startHttp({ MCP_UPSTREAM_CONCURRENCY: "1" });
    // Each waiter holds a 20 s timer and the request in flight its 15 s timeout: their count shows the queue.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const filling = Array.from({ length: 51 }, (_, i) => callForResult(port, "get_route", { id: 1 + i }));
    await vi.waitFor(() => {
      expect(vi.getTimerCount()).toBe(51);
    });

    const busy = await callForResult(port, "get_route", { id: 999 });
    expect(busy).toEqual({ content: [{ type: "text", text: `Error: ${BUSY_MESSAGE}` }], isError: true });

    // The coordinator's exemption for get_outings: the busy message goes in that ID's block, not the whole call.
    const outings = await callForResult(port, "get_outings", { ids: [1924138] });
    expect(outings.isError).toBeFalsy();
    expect(outings.content[0].text).toBe(`# Outing not read (ID: 1924138)\nError: ${BUSY_MESSAGE}`);

    release();
    const results = await Promise.all(filling);
    expect(results.every((result) => !result.isError)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(51); // never for a refused call
  });
});

describe("HTTP mode client disconnect", () => {
  it("drops a disconnected client's queued request and aborts its fetch in flight", async () => {
    const { fetchMock, release } = heldFetch();
    const { port } = await startHttp({ MCP_UPSTREAM_CONCURRENCY: "1" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const inFlight = openPost(port, callTool("get_route", { id: 1 }));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    const queued = openPost(port, callTool("get_route", { id: 2 }));
    await vi.waitFor(() => {
      expect(vi.getTimerCount()).toBe(2); // the 15 s timeout of route 1, the 20 s wait of route 2
    });

    queued.disconnect();
    await vi.waitFor(() => {
      expect(vi.getTimerCount()).toBe(1); // route 2 left the queue
    });
    inFlight.disconnect();
    const signal = fetchMock.mock.calls[0][1]?.signal;
    await vi.waitFor(() => {
      expect(signal?.aborted).toBe(true);
    });

    release();
    const next = await callForResult(port, "get_route", { id: 3 });
    expect(next.isError).toBeFalsy();
    expect(fetchMock.mock.calls.map(([url]) => routeId(url))).toEqual([1, 3]);
  });
});

describe("HTTP mode User-Agent (AC7.3)", () => {
  function sentUserAgent(fetchMock: ReturnType<typeof heldFetch>["fetchMock"]) {
    return new Headers(fetchMock.mock.calls[0][1]?.headers).get("User-Agent");
  }

  it.each([
    { env: {}, comment: "self-hosted" },
    { env: { MCP_OPERATOR_CONTACT: "ops@example.org" }, comment: "self-hosted; contact: ops@example.org" },
  ])("says $comment", async ({ env, comment }) => {
    const { fetchMock, release } = heldFetch();
    release();
    const { port } = await startHttp(env);

    await callForResult(port, "get_route", { id: 1 });

    expect(sentUserAgent(fetchMock)).toBe(`mcp-camptocamp/${VERSION} (+${REPOSITORY}; ${comment})`);
  });

  it("goes back to the stdio User-Agent and no cap once the HTTP server has stopped", async () => {
    const server = await startHttp({ MCP_OPERATOR_CONTACT: "ops@example.org", MCP_UPSTREAM_CONCURRENCY: "1" });
    await server.shutdown();
    expect(userAgent()).toBe(STDIO_USER_AGENT);

    const { fetchMock, release } = heldFetch();
    const requests = [1, 2].map((id) => getJson({ path: `/routes/${String(id)}`, schema: z.unknown() }));
    expect(fetchMock).toHaveBeenCalledTimes(2); // both at once: no cap any more
    expect(sentUserAgent(fetchMock)).toBe(STDIO_USER_AGENT);
    release();
    await Promise.all(requests);
  });

  it("keeps the stdio User-Agent when the HTTP server cannot listen", async () => {
    // 192.0.2.0/24 is TEST-NET-1 (RFC 5737): never assigned to a local interface.
    const proc: HttpProcess = {
      env: { MCP_TRANSPORT: "http", MCP_AUTH_TOKENS: TOKEN, MCP_HTTP_HOST: "192.0.2.1" },
      stderr: { write: () => true },
      exit: () => undefined,
      on: () => undefined,
    };
    expect(await runHttp(proc)).toBeUndefined();
    expect(userAgent()).toBe(STDIO_USER_AGENT);
  });
});
