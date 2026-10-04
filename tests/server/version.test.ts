import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { connect } from "./helpers.js";
import { VERSION } from "../../src/version.js";

const packageVersion = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }
).version;

describe("server version", () => {
  it("exports the package.json version", () => {
    expect(VERSION).toBe(packageVersion);
  });

  it("reports the package.json version to MCP clients", async () => {
    const client = await connect();

    expect(client.getServerVersion()).toEqual({ name: "mcp-camptocamp", version: packageVersion });
  });
});
