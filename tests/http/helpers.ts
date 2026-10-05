import { request as httpRequest, type IncomingHttpHeaders, type OutgoingHttpHeaders } from "node:http";
import { afterEach, vi } from "vitest";
import type { HttpConfig } from "../../src/http/config.js";
import { startHttpServer, type RunningHttpServer } from "../../src/http/server.js";

// The tests talk to the server with node:http, never with the global fetch: the tools' upstream calls
// go through fetch, which each test stubs (and asserts on) on its own.

// 64 hex characters, as `openssl rand -hex 32` prints them.
export const TOKEN = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0";
export const HOST = "mcp.example.org";
export const MCP_HEADERS = {
  host: HOST,
  authorization: `Bearer ${TOKEN}`,
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
};

export function testConfig(overrides: Partial<HttpConfig> = {}): HttpConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    tokens: [TOKEN],
    allowedHosts: [HOST],
    allowedOrigins: [],
    upstreamConcurrency: 4,
    operatorContact: undefined,
    ...overrides,
  };
}

const running: RunningHttpServer[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.shutdown()));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Starts the server on a free port; it is shut down after the test. Log lines are collected in `logs`. */
export async function startTestServer(
  overrides: Partial<HttpConfig> = {},
): Promise<RunningHttpServer & { logs: string[] }> {
  const logs: string[] = [];
  const server = await startHttpServer(testConfig(overrides), (line) => logs.push(line));
  running.push(server);
  return Object.assign(server, { logs });
}

export interface HttpResult {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface RequestOptions {
  method?: string;
  path?: string;
  headers?: OutgoingHttpHeaders;
  body?: string | Buffer | (() => Iterable<Buffer>);
}

/** One HTTP request on a fresh connection; resolves with the whole response. */
export function send(
  port: number,
  { method = "POST", path = "/mcp", headers = {}, body }: RequestOptions = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, method, path, headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") });
      });
      res.on("error", reject);
    });
    // The server may answer and close before a large or endless body is fully sent.
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE" && error.code !== "ECONNRESET") reject(error);
    });
    if (typeof body === "function") {
      // Streams the chunks with back-pressure until they run out or the server closes the connection.
      const closed = new Promise((resolve) => req.once("close", resolve));
      void (async () => {
        for (const chunk of body()) {
          if (req.destroyed) return;
          if (!req.write(chunk)) await Promise.race([new Promise((resolve) => req.once("drain", resolve)), closed]);
        }
        req.end();
      })();
      return;
    }
    req.end(body);
  });
}

/** POSTs a JSON-RPC message (or batch) to /mcp with a valid token, Host and Accept. */
export async function postMcp(
  port: number,
  message: unknown,
  headers: OutgoingHttpHeaders = {},
): Promise<HttpResult & { json: unknown }> {
  const result = await send(port, { body: JSON.stringify(message), headers: { ...MCP_HEADERS, ...headers } });
  return { ...result, json: result.body === "" ? undefined : JSON.parse(result.body) };
}

export function rpc(method: string, params: Record<string, unknown> = {}, id: number | string = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

export function callTool(name: string, args: Record<string, unknown>, id: number | string = 1) {
  return rpc("tools/call", { name, arguments: args }, id);
}

export const INITIALIZE = rpc("initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "http-test", version: "0" },
});

/** Mirrors GET /areas/{id}?lang=fr, trimmed to the fields get_area reads (summary and description absent). */
export function areaDocument(id: number, title: string) {
  return { document_id: id, area_type: "range", locales: [{ lang: "fr", title }], available_langs: ["fr"] };
}
