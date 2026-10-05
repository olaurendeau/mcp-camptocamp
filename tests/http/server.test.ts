import { afterEach, describe, it, expect, vi } from "vitest";
import { connect, jsonResponse } from "../server/helpers.js";
import { VERSION } from "../../src/version.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { startHttpServer } from "../../src/http/server.js";
import { ConfigError } from "../../src/http/config.js";
import {
  HOST,
  INITIALIZE,
  MCP_HEADERS,
  TOKEN,
  areaDocument,
  callTool,
  postMcp,
  rpc,
  send,
  startTestServer,
  testConfig,
} from "./helpers.js";

// A spy must not outlive its test, even one that failed before restoring it.
afterEach(() => {
  vi.restoreAllMocks();
});

const UNAUTHORIZED = '{"jsonrpc":"2.0","error":{"code":-32001,"message":"Unauthorized"},"id":null}';

/** A fetch stub that fails the test's expectations if any tool reaches the Camptocamp API. */
function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function toolNames(json: unknown): string[] {
  return (json as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name);
}

describe("HTTP server", () => {
  describe("routes", () => {
    it.each(["/mcp", "/mcp/", "/mcp?x=1"])("serves MCP on POST %s", async (path) => {
      const { port } = await startTestServer();
      const result = await send(port, { path, headers: MCP_HEADERS, body: JSON.stringify(rpc("tools/list")) });
      expect(result.status).toBe(200);
      expect(toolNames(JSON.parse(result.body))).toContain("get_route");
    });

    it.each(["GET", "DELETE", "OPTIONS", "PUT"])(
      "answers %s /mcp with 405 and Allow: POST, before the token",
      async (method) => {
        const { port } = await startTestServer();
        for (const headers of [MCP_HEADERS, { host: HOST }]) {
          const result = await send(port, { method, headers });
          expect(result.status).toBe(405);
          expect(result.headers.allow).toBe("POST");
        }
      },
    );

    it.each([
      "/",
      "/mcp/x",
      "/mcpx",
      "/healthz/",
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ])("answers %s with 404 and an empty body", async (path) => {
      const fetchMock = stubFetch();
      const { port } = await startTestServer();
      for (const method of ["GET", "POST"]) {
        const result = await send(port, { method, path, headers: MCP_HEADERS });
        expect(result.status).toBe(404);
        expect(result.body).toBe("");
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("/healthz", () => {
    it("returns 200 {status: ok} as JSON, with no token, a bad Host and an Origin, and never calls fetch", async () => {
      const fetchMock = stubFetch();
      const { port } = await startTestServer();
      const result = await send(port, {
        method: "GET",
        path: "/healthz",
        headers: { host: "evil.example", origin: "https://evil.example" },
      });
      expect(result.status).toBe(200);
      expect(result.headers["content-type"]).toBe("application/json");
      expect(result.body).toBe('{"status":"ok"}');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("answers other methods with 405 and Allow: GET", async () => {
      const { port } = await startTestServer();
      const result = await send(port, { method: "POST", path: "/healthz", body: "{}" });
      expect(result.status).toBe(405);
      expect(result.headers.allow).toBe("GET");
    });
  });

  describe("401", () => {
    it.each([
      ["no Authorization header", undefined],
      ["the Basic scheme", "Basic dXNlcjpwYXNz"],
      ["an empty token", "Bearer "],
    ])("answers %s with the bare Bearer challenge", async (_case, authorization) => {
      const fetchMock = stubFetch();
      const { port } = await startTestServer();
      const headers: Record<string, string> = { ...MCP_HEADERS };
      delete headers.authorization;
      if (authorization !== undefined) headers.authorization = authorization;
      const result = await send(port, { headers, body: JSON.stringify(callTool("get_area", { id: 1 })) });
      expect(result.status).toBe(401);
      expect(result.headers["www-authenticate"]).toBe('Bearer realm="mcp-camptocamp"');
      expect(result.headers["content-type"]).toBe("application/json");
      expect(result.body).toBe(UNAUTHORIZED);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("answers a wrong token with error=invalid_token and no resource_metadata", async () => {
      const fetchMock = stubFetch();
      const { port } = await startTestServer();
      const result = await postMcp(port, callTool("get_area", { id: 1 }), { authorization: `Bearer ${TOKEN}x` });
      expect(result.status).toBe(401);
      expect(result.headers["www-authenticate"]).toBe('Bearer realm="mcp-camptocamp", error="invalid_token"');
      expect(result.headers["content-type"]).toBe("application/json");
      expect(result.body).toBe(UNAUTHORIZED);
      expect(JSON.stringify(result.headers)).not.toContain("resource_metadata");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("accepts the scheme name in any case, and any configured token", async () => {
      const second = "a".repeat(40);
      const { port } = await startTestServer({ tokens: [TOKEN, second] });
      for (const authorization of [`bearer ${TOKEN}`, `BEARER ${second}`]) {
        const result = await postMcp(port, rpc("tools/list"), { authorization });
        expect(result.status).toBe(200);
      }
    });
  });

  describe("403", () => {
    it("refuses an unlisted Host before the method and the token, with a JSON-RPC error that has no id", async () => {
      const fetchMock = stubFetch();
      const { port } = await startTestServer();
      const result = await send(port, { headers: { host: "evil.example" }, body: "{}" });
      expect(result.status).toBe(403);
      expect(result.headers["content-type"]).toBe("application/json");
      const body = JSON.parse(result.body) as Record<string, unknown>;
      expect(body).toMatchObject({ jsonrpc: "2.0", error: { code: -32000 } });
      expect(body).not.toHaveProperty("id");
      expect((await send(port, { method: "GET", headers: { host: "evil.example" } })).status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses an unlisted Origin before the token, and accepts a listed one", async () => {
      const { port } = await startTestServer({ allowedOrigins: ["https://claude.ai"] });
      const refused = await send(port, { headers: { host: HOST, origin: "https://evil.example" }, body: "{}" });
      expect(refused.status).toBe(403);
      expect(JSON.parse(refused.body)).not.toHaveProperty("id");
      const accepted = await postMcp(port, rpc("tools/list"), { origin: "https://claude.ai" });
      expect(accepted.status).toBe(200);
    });
  });

  describe("413", () => {
    it("refuses a declared Content-Length over 64 KiB before any fetch, with Connection: close", async () => {
      const fetchMock = stubFetch();
      const { port } = await startTestServer();
      const result = await send(port, {
        headers: { ...MCP_HEADERS, "content-length": "65537" },
        body: function* () {
          yield Buffer.alloc(65_537, " ");
        },
      });
      expect(result.status).toBe(413);
      expect(result.headers.connection).toBe("close");
      expect(JSON.parse(result.body)).toMatchObject({ jsonrpc: "2.0", error: { code: -32000 }, id: null });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses a streamed body over 64 KiB before any fetch, with Connection: close", async () => {
      const fetchMock = stubFetch();
      const { port } = await startTestServer();
      const message = JSON.stringify(callTool("get_area", { id: 1 }));
      const result = await send(port, {
        headers: MCP_HEADERS, // chunked, no Content-Length
        body: function* () {
          yield Buffer.from(message);
          for (;;) yield Buffer.alloc(16_384, " ");
        },
      });
      expect(result.status).toBe(413);
      expect(result.headers.connection).toBe("close");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("400", () => {
    it("refuses invalid JSON with a JSON-RPC parse error", async () => {
      const { port } = await startTestServer();
      const result = await send(port, { headers: MCP_HEADERS, body: '{"jsonrpc":' });
      expect(result.status).toBe(400);
      expect(result.body).toBe(
        '{"jsonrpc":"2.0","error":{"code":-32700,"message":"Parse error: Invalid JSON"},"id":null}',
      );
    });
  });

  describe("stateless MCP", () => {
    // The SDK copies every request header into requestInfo.headers, which every tool handler receives.
    it("hands the SDK the request without its Authorization and Cookie headers", async () => {
      const handleRequest = vi.spyOn(WebStandardStreamableHTTPServerTransport.prototype, "handleRequest");
      const { port } = await startTestServer();
      const result = await postMcp(port, rpc("tools/list"), { cookie: "session=secret" });
      const { headers } = handleRequest.mock.calls[0][0];
      expect(result.status).toBe(200);
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("cookie")).toBeNull();
      expect(headers.get("accept")).toBe(MCP_HEADERS.accept);
    });

    it("sends no Mcp-Session-Id, and ignores one sent by the client", async () => {
      const { port } = await startTestServer();
      const init = await postMcp(port, INITIALIZE);
      expect(init.headers["mcp-session-id"]).toBeUndefined();
      const list = await postMcp(port, rpc("tools/list", {}, 2), { "mcp-session-id": "made-up-session" });
      expect(list.status).toBe(200);
      expect(list.headers["mcp-session-id"]).toBeUndefined();
      expect(list.json).toMatchObject({ id: 2 });
      expect(toolNames(list.json)).toContain("get_route");
    });

    it("answers tools/list and tools/call without initialize", async () => {
      const fetchMock = stubFetch();
      fetchMock.mockResolvedValueOnce(jsonResponse(areaDocument(14403, "Écrins")));
      const { port } = await startTestServer();
      const list = await postMcp(port, rpc("tools/list"));
      expect(toolNames(list.json)).toContain("get_area");
      const call = await postMcp(port, callTool("get_area", { id: 14403 }));
      expect(call.status).toBe(200);
      expect(call.json).toMatchObject({ id: 1, result: { content: [{ type: "text" }] } });
      expect(JSON.stringify(call.json)).toContain("Écrins");
    });

    it("gives two concurrent calls with the same JSON-RPC id each their own result", async () => {
      const fetchMock = stubFetch();
      // Both calls are in flight before either upstream answer arrives, and they arrive in reverse order.
      const pending = new Map<string, (response: Response) => void>();
      fetchMock.mockImplementation(
        (input) =>
          new Promise<Response>((resolve) => {
            pending.set(input instanceof Request ? input.url : input.toString(), resolve);
          }),
      );
      const { port } = await startTestServer();
      const first = postMcp(port, callTool("get_area", { id: 111 }, 7));
      const second = postMcp(port, callTool("get_area", { id: 222 }, 7));
      await vi.waitFor(() => {
        expect(pending.size).toBe(2);
      });
      for (const [url, resolve] of [...pending].reverse()) {
        const id = url.includes("/areas/111") ? 111 : 222;
        resolve(jsonResponse(areaDocument(id, `Area ${id}`)));
      }
      const [a, b] = await Promise.all([first, second]);
      expect(JSON.stringify(a.json)).toContain("Area 111");
      expect(JSON.stringify(a.json)).not.toContain("Area 222");
      expect(JSON.stringify(b.json)).toContain("Area 222");
      expect(JSON.stringify(b.json)).not.toContain("Area 111");
    });
  });

  it("answers initialize 2025-11-25 with the same name, version and instructions as the in-memory server", async () => {
    const { port } = await startTestServer();
    const result = await postMcp(port, INITIALIZE);
    const client = await connect();
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({
      id: 1,
      result: {
        protocolVersion: "2025-11-25",
        serverInfo: { name: "mcp-camptocamp", version: VERSION },
        instructions: client.getInstructions(),
      },
    });
  });

  describe("startup", () => {
    it("logs exactly one JSON line with the settings and the token count, never a token", async () => {
      const server = await startTestServer({ allowedOrigins: ["https://claude.ai"], upstreamConcurrency: 2 });
      expect(server.logs).toHaveLength(1);
      expect(server.logs[0]).not.toContain("\n");
      expect(server.logs[0]).not.toContain(TOKEN.slice(0, 8));
      expect(JSON.parse(server.logs[0])).toEqual({
        message: "listening",
        transport: "http",
        host: "127.0.0.1",
        port: server.port,
        path: "/mcp",
        allowed_hosts: [HOST],
        allowed_origins: ["https://claude.ai"],
        tokens: 1,
        upstream_concurrency: 2,
        version: VERSION,
      });
    });

    it("refuses a port already in use with a message naming MCP_HTTP_PORT", async () => {
      const { port } = await startTestServer();
      const failure = startHttpServer(testConfig({ port }), () => undefined);
      await expect(failure).rejects.toBeInstanceOf(ConfigError);
      await expect(failure).rejects.toThrow(`MCP_HTTP_PORT: port ${port} is already in use on 127.0.0.1`);
    });
  });
});
