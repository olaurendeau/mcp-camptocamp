import { configureUpstream } from "../api/upstream.js";
import { ConfigError, readHttpConfig, type Env, type HttpConfig } from "./config.js";
import { startHttpServer, type RunningHttpServer } from "./server.js";

// The parts of `process` the HTTP mode uses, so tests can run it in-process.
export interface HttpProcess {
  env: Env;
  stderr: { write(text: string): unknown };
  exit(code: number): void;
  on(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
}

// Starts the HTTP mode: one startup line on stderr, or a configuration or listen error and exit 1.
// While it runs, Camptocamp requests share MCP_UPSTREAM_CONCURRENCY slots and send the self-hosted User-Agent;
// once it has stopped (or failed to start), both are back to the stdio behaviour.
// Node runs as PID 1 in the Docker image, where a signal without a handler does nothing: SIGTERM and SIGINT
// drain the server (at most 8 s) and exit 0; a second signal exits 1 at once, cutting in-flight requests.
export async function runHttp(proc: HttpProcess = process): Promise<RunningHttpServer | undefined> {
  let running: RunningHttpServer;
  try {
    running = await startUpstreamAndServer(readHttpConfig(proc.env), proc);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    proc.stderr.write(`${error.message}\n`);
    proc.exit(1);
    return undefined;
  }
  let stopping = false;
  const stop = (): void => {
    if (stopping) {
      proc.exit(1);
      return;
    }
    stopping = true;
    void running.shutdown().then(() => {
      proc.exit(0);
    });
  };
  proc.on("SIGTERM", stop);
  proc.on("SIGINT", stop);
  return running;
}

async function startUpstreamAndServer(config: HttpConfig, proc: HttpProcess): Promise<RunningHttpServer> {
  configureUpstream({ concurrency: config.upstreamConcurrency, operatorContact: config.operatorContact });
  let started: RunningHttpServer;
  try {
    started = await startHttpServer(config, (line) => proc.stderr.write(`${line}\n`));
  } catch (error) {
    configureUpstream(undefined);
    throw error;
  }
  let stopped: Promise<void> | undefined;
  const shutdown = () =>
    (stopped ??= started.shutdown().then(() => {
      configureUpstream(undefined);
    }));
  return { ...started, shutdown };
}
