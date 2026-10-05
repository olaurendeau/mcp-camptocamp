import { createServer as createNodeServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { runInRequestContext } from "../api/upstream.js";
import { createServer } from "../server.js";
import { VERSION } from "../version.js";
import { createTokenChecker } from "./auth.js";
import { BodyTooLargeError, MAX_BODY_BYTES, readBody } from "./body.js";
import { ConfigError, type HttpConfig } from "./config.js";
import { checkHostAndOrigin } from "./guards.js";

// The MCP Streamable HTTP endpoint, stateless: every POST gets a fresh transport and a fresh MCP server, so no
// session, no GET stream and nothing shared between requests. The pipeline, in order (#277 technical design):
// /healthz, path, Host, Origin, method, token, body size, JSON, then the SDK.

export const MCP_PATH = "/mcp";
const HEALTH_PATH = "/healthz";
const DRAIN_MS = 8_000;
// Above the idle keep-alive of a reverse proxy in front (Caddy keeps idle upstream connections for 2 min), so
// the proxy, not this server, closes an idle connection and never reuses one this server is closing.
const KEEP_ALIVE_TIMEOUT_MS = 125_000;
const REALM = 'Bearer realm="mcp-camptocamp"';

export interface RunningHttpServer {
  server: Server;
  port: number; // the bound port, useful when the config asked for 0
  // Stops accepting connections and lets in-flight requests finish for up to 8 s; the same promise every call.
  shutdown(): Promise<void>;
}

interface InFlight {
  res: ServerResponse;
  // The request's upstream context (src/api/upstream.ts) signal: aborted when the client disconnects before its
  // response or when the drain deadline passes, which drops its queued Camptocamp requests and aborts its fetches.
  abort: AbortController;
}

type HeaderMap = Record<string, string>;

const JSON_TYPE = { "Content-Type": "application/json" };

function rpcError(code: number, message: string, withId = true): string {
  return JSON.stringify({ jsonrpc: "2.0", error: { code, message }, ...(withId ? { id: null } : {}) });
}

export function startHttpServer(config: HttpConfig, log: (line: string) => void): Promise<RunningHttpServer> {
  const checkToken = createTokenChecker(config.tokens);
  const inFlight = new Set<InFlight>();
  let shuttingDown = false;

  // Writes the response once: a late result after the drain deadline (or the reverse) is dropped. While shutting
  // down, every response closes its connection, so a keep-alive client cannot hold the server open.
  function respond(res: ServerResponse, status: number, headers: HeaderMap, body = ""): void {
    if (res.headersSent || res.destroyed) return;
    const length = { "Content-Length": String(Buffer.byteLength(body)) };
    res.writeHead(status, { ...headers, ...length, ...(shuttingDown ? { Connection: "close" } : {}) });
    res.end(body);
  }

  // A refusal sent before the body is read leaves it unread: the connection closes rather than reading it all.
  function refuse(res: ServerResponse, status: number, headers: HeaderMap, body: string): void {
    respond(res, status, { ...headers, Connection: "close" }, body);
  }

  async function handle(req: IncomingMessage, res: ServerResponse, abort: AbortSignal): Promise<void> {
    const path = (req.url ?? "").split("?", 1)[0];

    if (path === HEALTH_PATH) {
      if (req.method !== "GET") {
        refuse(res, 405, { Allow: "GET" }, "");
      } else if (shuttingDown) {
        respond(res, 503, JSON_TYPE, '{"status":"shutting down"}');
      } else {
        respond(res, 200, JSON_TYPE, '{"status":"ok"}');
      }
      return;
    }
    if (path !== MCP_PATH && path !== `${MCP_PATH}/`) {
      refuse(res, 404, {}, "");
      return;
    }
    const guard = checkHostAndOrigin(req.headers, config);
    if (!guard.ok) {
      const header = guard.header === "host" ? "Host" : "Origin";
      refuse(res, 403, JSON_TYPE, rpcError(-32000, `Forbidden: ${header} not allowed`, false));
      return;
    }
    if (req.method !== "POST") {
      refuse(res, 405, { ...JSON_TYPE, Allow: "POST" }, rpcError(-32000, "Method not allowed"));
      return;
    }
    const auth = checkToken(req.headers.authorization);
    if (typeof auth !== "number") {
      const challenge = auth === "invalid" ? `${REALM}, error="invalid_token"` : REALM;
      refuse(res, 401, { ...JSON_TYPE, "WWW-Authenticate": challenge }, rpcError(-32001, "Unauthorized"));
      return;
    }

    let text: string;
    try {
      text = await readBody(req);
    } catch (error) {
      if (!(error instanceof BodyTooLargeError)) {
        res.destroy(); // the client went away mid-body: nobody is left to answer
        return;
      }
      refuse(res, 413, JSON_TYPE, rpcError(-32000, `Request body over ${MAX_BODY_BYTES} bytes`));
      return;
    }
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(text);
    } catch {
      respond(res, 400, JSON_TYPE, rpcError(-32700, "Parse error: Invalid JSON"));
      return;
    }

    const response = await handleMcp(req, parsedBody, abort);
    if (response === undefined) return;
    respond(res, response.status, Object.fromEntries(response.headers), await response.text());
  }

  // One stateless SDK transport and MCP server for this request only. Credentials stop here: the
  // Authorization and Cookie headers never reach the SDK or the tools.
  async function handleMcp(req: IncomingMessage, parsedBody: unknown, abort: AbortSignal) {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || name === "authorization" || name === "cookie") continue;
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    const request = new Request(new URL(MCP_PATH, "http://localhost"), { method: "POST", headers });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createServer();
    try {
      await server.connect(transport);
      const aborted = abort.aborted ? Promise.resolve(undefined) : once(abort, "abort").then(() => undefined);
      return await Promise.race([transport.handleRequest(request, { parsedBody }), aborted]);
    } finally {
      await server.close();
    }
  }

  const server = createNodeServer((req, res) => {
    const entry: InFlight = { res, abort: new AbortController() };
    inFlight.add(entry);
    res.once("close", () => {
      inFlight.delete(entry);
      if (!res.writableFinished) entry.abort.abort(); // closed before its response: the client went away
    });
    const context = { upstreamRequests: 0, signal: entry.abort.signal };
    runInRequestContext(context, () => handle(req, res, entry.abort.signal)).catch(() => {
      respond(res, 500, JSON_TYPE, rpcError(-32603, "Internal error"));
    });
  });
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;

  let shutdownPromise: Promise<void> | undefined;
  async function drain(): Promise<void> {
    shuttingDown = true; // /healthz now answers 503
    const closed = once(server, "close");
    server.close();
    server.closeIdleConnections();
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((resolve) => (timer = setTimeout(resolve, DRAIN_MS)));
    await Promise.race([closed, deadline]);
    clearTimeout(timer);
    // Past the deadline: whatever is still in flight gets 503, then every connection closes.
    const finished = [...inFlight].map(({ res, abort }) => {
      abort.abort();
      respond(res, 503, JSON_TYPE, rpcError(-32000, "Server shutting down"));
      return once(res, "close");
    });
    await Promise.all(finished);
    server.closeAllConnections();
    await closed;
  }

  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      reject(listenError(config, error));
    });
    server.listen(config.port, config.host, () => {
      const { port } = server.address() as AddressInfo;
      log(
        JSON.stringify({
          message: "listening",
          transport: "http",
          host: config.host,
          port,
          path: MCP_PATH,
          allowed_hosts: config.allowedHosts,
          allowed_origins: config.allowedOrigins,
          tokens: config.tokens.length,
          upstream_concurrency: config.upstreamConcurrency,
          version: VERSION,
        }),
      );
      resolve({ server, port, shutdown: () => (shutdownPromise ??= drain()) });
    });
  });
}

// A listen error names the variable to fix. The message holds only the configured host and port.
function listenError(config: HttpConfig, error: NodeJS.ErrnoException): ConfigError {
  if (error.code === "EADDRINUSE") {
    return new ConfigError(`MCP_HTTP_PORT: port ${config.port} is already in use on ${config.host}`);
  }
  if (error.code === "EACCES") {
    return new ConfigError(`MCP_HTTP_PORT: no permission to listen on port ${config.port} (EACCES)`);
  }
  return new ConfigError(`MCP_HTTP_HOST: cannot listen on ${config.host} (${error.code ?? error.message})`);
}
