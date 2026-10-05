import { connect as netConnect, type Socket } from "node:net";
import { describe, it, expect, vi } from "vitest";
import { jsonResponse } from "../server/helpers.js";
import { HOST, areaDocument, callTool, postMcp, send, startTestServer } from "./helpers.js";

/** A fetch stub whose calls stay pending until the test resolves them, in call order. */
function pendingFetch() {
  const resolvers: ((response: Response) => void)[] = [];
  const fetchMock = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((resolve) => {
        resolvers.push(resolve);
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, resolvers };
}

/** A raw connection that has started a GET /healthz request: it is not idle, so shutdown keeps it open. */
async function startedHealthCheck(port: number): Promise<{ socket: Socket; finish: () => Promise<string> }> {
  const socket = netConnect(port, "127.0.0.1");
  await new Promise((resolve) => socket.once("connect", resolve));
  socket.write(`GET /healthz HTTP/1.1\r\nHost: ${HOST}\r\n`);
  // Lets the server parse the request line, so the connection no longer counts as idle.
  await new Promise((resolve) => setTimeout(resolve, 100));
  let response = "";
  socket.on("data", (chunk: Buffer) => (response += chunk.toString("utf8")));
  const ended = new Promise((resolve) => socket.once("close", resolve));
  return {
    socket,
    finish: async () => {
      socket.write("\r\n");
      await ended;
      return response;
    },
  };
}

describe("HTTP server shutdown", () => {
  it("answers /healthz with 503 and lets an in-flight request finish, then resolves", async () => {
    const { fetchMock, resolvers } = pendingFetch();
    const server = await startTestServer();
    const inFlight = postMcp(server.port, callTool("get_area", { id: 14403 }));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    const health = await startedHealthCheck(server.port);

    let stopped = false;
    const shutdown = server.shutdown().then(() => (stopped = true));
    const healthResponse = await health.finish();
    expect(healthResponse).toMatch(/^HTTP\/1\.1 503 /);
    expect(healthResponse).toMatch(/\r\nConnection: close\r\n/i);
    expect(healthResponse.endsWith('\r\n\r\n{"status":"shutting down"}')).toBe(true);
    expect(stopped).toBe(false);

    resolvers[0](jsonResponse(areaDocument(14403, "Écrins")));
    const result = await inFlight;
    expect(result.status).toBe(200);
    expect(result.headers.connection).toBe("close");
    expect(JSON.stringify(result.json)).toContain("Écrins");
    await shutdown;
    expect(stopped).toBe(true);
  });

  it("refuses new connections once shutdown has started", async () => {
    const server = await startTestServer();
    await server.shutdown();
    await expect(send(server.port, { method: "GET", path: "/healthz" })).rejects.toMatchObject({
      code: "ECONNREFUSED",
    });
  });

  it("ends the drain by 8 s: a request still in flight gets 503", async () => {
    const { fetchMock } = pendingFetch();
    const server = await startTestServer();
    const inFlight = postMcp(server.port, callTool("get_area", { id: 14403 }));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let stopped = false;
    const shutdown = server.shutdown().then(() => (stopped = true));
    await vi.advanceTimersByTimeAsync(7_999);
    expect(stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await shutdown;
    vi.useRealTimers();

    const result = await inFlight;
    expect(result.status).toBe(503);
    expect(result.headers.connection).toBe("close");
    expect(result.json).toEqual({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Server shutting down" },
      id: null,
    });
  });
});
