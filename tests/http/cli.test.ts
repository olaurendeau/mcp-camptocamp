import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { runHttp, type HttpProcess } from "../../src/http/main.js";
import { VERSION } from "../../src/version.js";
import { INITIALIZE, TOKEN, freePort, rpc, send } from "./helpers.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const HTTP_ENV = { MCP_TRANSPORT: "http", MCP_AUTH_TOKENS: TOKEN };

const lines = (text: string): string[] => text.split("\n").filter(Boolean);

/** Runs `node --import tsx src/index.ts` with the given MCP_* variables (and none from the test's own env). */
function spawnServer(env: Record<string, string>) {
  const { PATH, HOME } = process.env;
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ROOT,
    env: { PATH, HOME, ...env },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
  const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
  return { child, stdout: () => stdout, stderr: () => stderr, exited };
}

describe("CLI", { timeout: 30_000 }, () => {
  it("serves stdio by default and writes nothing to stderr, even with bad HTTP settings", async () => {
    const server = spawnServer({ MCP_HTTP_PORT: "abc", MCP_HTTP_HOST: "nowhere", MCP_AUTH_TOKENS: "short" });
    server.child.stdin.write(`${JSON.stringify(INITIALIZE)}\n`);
    server.child.stdin.write(`${JSON.stringify(rpc("tools/list", {}, 2))}\n`);
    await expect.poll(() => lines(server.stdout()), { timeout: 20_000 }).toHaveLength(2);
    const [init, list] = lines(server.stdout()).map((line) => JSON.parse(line) as { result: Record<string, unknown> });
    expect(init.result.serverInfo).toEqual({ name: "mcp-camptocamp", version: VERSION });
    expect(list.result.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: "get_route" })]));
    server.child.stdin.end();
    await server.exited;
    expect(server.stderr()).toBe("");
  });

  it("exits 1 when MCP_TRANSPORT=http has no MCP_AUTH_TOKENS", async () => {
    const server = spawnServer({ MCP_TRANSPORT: "http" });
    expect(await server.exited).toBe(1);
    expect(server.stderr()).toBe("MCP_AUTH_TOKENS is required when MCP_TRANSPORT=http\n");
  });

  it("exits 1 on an unknown MCP_TRANSPORT", async () => {
    const server = spawnServer({ MCP_TRANSPORT: "htp" });
    expect(await server.exited).toBe(1);
    expect(server.stderr()).toBe('MCP_TRANSPORT must be "stdio" or "http"\n');
  });

  it("prints one startup line in HTTP mode, serves /healthz, and exits 0 on SIGTERM", async () => {
    const port = await freePort();
    const server = spawnServer({ ...HTTP_ENV, MCP_HTTP_PORT: String(port) });
    await expect.poll(() => server.stderr(), { timeout: 20_000 }).toContain("\n");
    expect(lines(server.stderr())).toHaveLength(1);
    expect(JSON.parse(server.stderr())).toMatchObject({ message: "listening", port, tokens: 1 });
    expect(server.stderr()).not.toContain(TOKEN);

    const health = await send(port, { method: "GET", path: "/healthz", headers: { host: `localhost:${port}` } });
    expect(health.status).toBe(200);

    server.child.kill("SIGTERM");
    expect(await server.exited).toBe(0);
  });
});

/** A stand-in for `process`: records stderr, exit codes and signal listeners. */
class FakeProcess {
  stderr = "";
  readonly exits: number[] = [];
  private readonly listeners = new Map<string, () => void>();

  constructor(readonly env: Record<string, string>) {}

  get process(): HttpProcess {
    return {
      env: this.env,
      stderr: { write: (text: string) => (this.stderr += text) },
      exit: (code: number) => {
        this.exits.push(code);
      },
      on: (signal: string, listener: () => void) => this.listeners.set(signal, listener),
    };
  }

  signal(name: string): void {
    this.listeners.get(name)?.();
  }
}

describe("runHttp", () => {
  it("prints a configuration error and exits 1, with no listener installed", async () => {
    const proc = new FakeProcess({ MCP_TRANSPORT: "http", MCP_AUTH_TOKENS: "short-token" });
    await runHttp(proc.process);
    expect(proc.stderr).toBe("MCP_AUTH_TOKENS: token 1 is shorter than 32 characters\n");
    expect(proc.exits).toEqual([1]);
  });

  // 192.0.2.0/24 is TEST-NET-1 (RFC 5737): never assigned to a local interface.
  it("prints a listen error naming the variable and exits 1", async () => {
    const proc = new FakeProcess({ ...HTTP_ENV, MCP_HTTP_HOST: "192.0.2.1" });
    await runHttp(proc.process);
    expect(proc.stderr).toBe("MCP_HTTP_HOST: cannot listen on 192.0.2.1 (EADDRNOTAVAIL)\n");
    expect(proc.exits).toEqual([1]);
  });

  it.each(["SIGTERM", "SIGINT"])("drains on %s and exits 0; a second signal exits 1 at once", async (signal) => {
    const port = await freePort();
    const proc = new FakeProcess({ ...HTTP_ENV, MCP_HTTP_PORT: String(port) });
    const server = await runHttp(proc.process);
    expect(server?.port).toBe(port);
    expect(lines(proc.stderr)).toHaveLength(1);

    proc.signal(signal);
    proc.signal(signal);
    expect(proc.exits).toEqual([1]);
    await vi.waitFor(() => {
      expect(proc.exits).toEqual([1, 0]);
    });
  });
});
