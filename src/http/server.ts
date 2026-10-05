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
// /healthz, path, Host, Origin, method, token, body size, JSON, then the SDK. A request still unanswered after
// 90 s gets a 504. Each request writes one JSON line to the log once its connection is done with it.

export const MCP_PATH = "/mcp";
const HEALTH_PATH = "/healthz";
const REQUEST_TIMEOUT_MS = 90_000;
const DRAIN_MS = 8_000;
// After the drain deadline, how long the 503s get to reach their clients before every connection is cut. Without
// a bound, a client that stopped reading its response would hold the shutdown open until Docker's SIGKILL (10 s).
const CLOSE_GRACE_MS = 1_000;
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
  // response, at the 90 s timeout or when the drain deadline passes, which drops its queued Camptocamp requests
  // and aborts its fetches.
  abort: AbortController;
  log: LogFields;
}

// What the request's log line says besides its status, filled in as the pipeline learns it. Never the body, the
// tool arguments, the query string, the client's address or the response: only names that match RPC_NAME.
interface LogFields {
  rpc: string | null; // the JSON-RPC method, "batch" or "invalid"; null when no JSON body was parsed
  tool: string | null; // params.name of a tools/call
  outcome: Outcome; // from the JSON-RPC response; an HTTP status of 400 or more makes it "rejected"
  token: number | null; // 1-based position of the matching token in MCP_AUTH_TOKENS
  rejected?: { header: "host" | "origin"; value: string }; // a 403's refused value, for the operator to allow it
}

type Outcome = "ok" | "tool_error" | "rejected";

const RPC_NAME = /^[A-Za-z_/]{1,64}$/;
const MAX_LOGGED_LENGTH = 200;
// Logged when the client went away before any response was sent (nginx's "client closed request").
const CLIENT_CLOSED = 499;

type HeaderMap = Record<string, string>;

const JSON_TYPE = { "Content-Type": "application/json" };

function rpcError(code: number, message: string, withId = true): string {
  return JSON.stringify({ jsonrpc: "2.0", error: { code, message }, ...(withId ? { id: null } : {}) });
}

export function startHttpServer(config: HttpConfig, log: (line: string) => void): Promise<RunningHttpServer> {
  const checkToken = createTokenChecker(config.tokens);
  const inFlight = new Set<InFlight>();
  let shuttingDown = false;

  // Writes the response once: a late result after the timeout or the drain deadline (or the reverse) is dropped.
  // While shutting down, every response closes its connection, so a keep-alive client cannot hold the server open.
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

  async function handle(req: IncomingMessage, { res, abort, log: fields }: InFlight): Promise<void> {
    const path = pathOf(req);

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
      fields.rejected = { header: guard.header, value: guard.value };
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
    fields.token = auth;

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
    Object.assign(fields, describeRequest(parsedBody));

    const response = await handleMcp(req, parsedBody, abort.signal);
    if (response === undefined) return;
    const body = await response.text();
    fields.outcome = responseOutcome(body);
    respond(res, response.status, Object.fromEntries(response.headers), body);
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
      if (abort.aborted) return undefined; // timed out or abandoned while connecting: the SDK never sees it
      const aborted = once(abort, "abort").then(() => undefined);
      return await Promise.race([transport.handleRequest(request, { parsedBody }), aborted]);
    } finally {
      await server.close();
    }
  }

  const server = createNodeServer((req, res) => {
    const started = performance.now();
    const fields: LogFields = { rpc: null, tool: null, outcome: "ok", token: null };
    const entry: InFlight = { res, abort: new AbortController(), log: fields };
    const context = { upstreamRequests: 0, signal: entry.abort.signal };
    inFlight.add(entry);
    // Counted from arrival, so the body may still be on its way: the 504 closes the connection.
    const timer = setTimeout(() => {
      refuse(res, 504, JSON_TYPE, rpcError(-32000, `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} s`));
      entry.abort.abort();
    }, REQUEST_TIMEOUT_MS);
    res.once("close", () => {
      clearTimeout(timer);
      inFlight.delete(entry);
      if (!res.writableFinished) entry.abort.abort(); // closed before its response: the client went away
      log(logLine(req, res, fields, context.upstreamRequests, performance.now() - started));
    });
    runInRequestContext(context, () => handle(req, entry)).catch(() => {
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
    await within(closed, DRAIN_MS);
    // Past the deadline: whatever is still in flight gets 503, then every connection closes.
    const finished = [...inFlight].map(({ res, abort }) => {
      abort.abort();
      respond(res, 503, JSON_TYPE, rpcError(-32000, "Server shutting down"));
      return once(res, "close");
    });
    await within(Promise.all(finished), CLOSE_GRACE_MS);
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

// Waits for `promise`, but at most `ms`.
async function within(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const elapsed = new Promise<void>((resolve) => (timer = setTimeout(resolve, ms)));
  await Promise.race([promise, elapsed]);
  clearTimeout(timer);
}

function pathOf(req: IncomingMessage): string {
  return (req.url ?? "").split("?", 1)[0] ?? "";
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function rpcName(value: unknown): string {
  return typeof value === "string" && RPC_NAME.test(value) ? value : "invalid";
}

// The JSON-RPC method and tool name, only when they look like names: anything else a client sent stays out.
function describeRequest(body: unknown): Pick<LogFields, "rpc" | "tool"> {
  if (Array.isArray(body)) return { rpc: "batch", tool: null };
  const rpc = rpcName(field(body, "method"));
  return { rpc, tool: rpc === "tools/call" ? rpcName(field(field(body, "params"), "name")) : null };
}

// "rejected" for a JSON-RPC error, "tool_error" for an isError result, "ok" otherwise; a batch gets its worst entry.
function responseOutcome(text: string): Outcome {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return "ok"; // the 202 to a notification has no body
  }
  const entries: unknown[] = Array.isArray(body) ? body : [body];
  if (entries.some((entry) => field(entry, "error") !== undefined)) return "rejected";
  return entries.some((entry) => field(field(entry, "result"), "isError") === true) ? "tool_error" : "ok";
}

function logLine(
  req: IncomingMessage,
  res: ServerResponse,
  fields: LogFields,
  upstreamRequests: number,
  durationMs: number,
): string {
  const status = res.headersSent ? res.statusCode : CLIENT_CLOSED;
  const { rejected } = fields;
  return JSON.stringify({
    time: new Date().toISOString(),
    method: req.method,
    path: pathOf(req).slice(0, MAX_LOGGED_LENGTH),
    status,
    duration_ms: Math.round(durationMs),
    rpc: fields.rpc,
    tool: fields.tool,
    result: status >= 400 ? "rejected" : fields.outcome,
    upstream_requests: upstreamRequests,
    token: fields.token,
    ...(rejected ? { [`rejected_${rejected.header}`]: rejected.value.slice(0, MAX_LOGGED_LENGTH) } : {}),
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
