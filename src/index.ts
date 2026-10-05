#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { ConfigError, readTransport, type Transport } from "./http/config.js";

let transport: Transport;
try {
  transport = readTransport(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

if (transport === "http") {
  // Loaded only in HTTP mode, which also installs the SIGTERM/SIGINT handlers; stdio installs none.
  const { runHttp } = await import("./http/main.js");
  await runHttp();
} else {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
