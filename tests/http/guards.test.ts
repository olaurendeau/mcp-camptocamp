import { describe, it, expect } from "vitest";
import { checkHostAndOrigin, isHostAllowed, isOriginAllowed } from "../../src/http/guards.js";

const HOSTS = ["mcp.example.org", "localhost:3000"];
const ORIGINS = ["https://claude.ai", "http://localhost:5173"];

describe("isHostAllowed", () => {
  it("passes a host in the list, compared in lowercase", () => {
    expect(isHostAllowed("mcp.example.org", HOSTS)).toBe(true);
    expect(isHostAllowed("MCP.Example.ORG", HOSTS)).toBe(true);
    expect(isHostAllowed("localhost:3000", HOSTS)).toBe(true);
  });

  it("refuses a host outside the list, including a different port or a missing Host", () => {
    expect(isHostAllowed("evil.example", HOSTS)).toBe(false);
    expect(isHostAllowed("mcp.example.org:8443", HOSTS)).toBe(false);
    expect(isHostAllowed("localhost", HOSTS)).toBe(false);
    expect(isHostAllowed("mcp.example.org.evil.example", HOSTS)).toBe(false);
    expect(isHostAllowed("", HOSTS)).toBe(false);
    expect(isHostAllowed(undefined, HOSTS)).toBe(false);
  });
});

describe("isOriginAllowed", () => {
  it("passes a missing Origin", () => {
    expect(isOriginAllowed(undefined, ORIGINS)).toBe(true);
    expect(isOriginAllowed(undefined, [])).toBe(true);
  });

  it("passes an origin in the list, compared in lowercase", () => {
    expect(isOriginAllowed("https://claude.ai", ORIGINS)).toBe(true);
    expect(isOriginAllowed("HTTPS://Claude.AI", ORIGINS)).toBe(true);
    expect(isOriginAllowed("http://localhost:5173", ORIGINS)).toBe(true);
  });

  it("refuses a present origin outside the list", () => {
    expect(isOriginAllowed("https://evil.example", ORIGINS)).toBe(false);
    expect(isOriginAllowed("http://claude.ai", ORIGINS)).toBe(false);
    expect(isOriginAllowed("https://claude.ai/", ORIGINS)).toBe(false);
    expect(isOriginAllowed("null", ORIGINS)).toBe(false);
    expect(isOriginAllowed("", ORIGINS)).toBe(false);
  });

  it("refuses every present Origin when the list is empty", () => {
    for (const origin of ["https://claude.ai", "http://localhost:3000", "null", ""]) {
      expect(isOriginAllowed(origin, [])).toBe(false);
    }
  });
});

describe("checkHostAndOrigin", () => {
  const allowed = { allowedHosts: HOSTS, allowedOrigins: ORIGINS };

  it("passes an allowed Host with an allowed or missing Origin", () => {
    expect(checkHostAndOrigin({ host: "mcp.example.org", origin: "https://claude.ai" }, allowed)).toEqual({
      ok: true,
    });
    expect(checkHostAndOrigin({ host: "mcp.example.org" }, allowed)).toEqual({ ok: true });
  });

  it("refuses the Host first, with the rejected value", () => {
    expect(checkHostAndOrigin({ host: "evil.example", origin: "https://evil.example" }, allowed)).toEqual({
      ok: false,
      header: "host",
      value: "evil.example",
    });
  });

  it("reports a missing Host as an empty value", () => {
    expect(checkHostAndOrigin({}, allowed)).toEqual({ ok: false, header: "host", value: "" });
  });

  it("refuses an Origin outside the list, with the rejected value", () => {
    expect(checkHostAndOrigin({ host: "mcp.example.org", origin: "https://evil.example" }, allowed)).toEqual({
      ok: false,
      header: "origin",
      value: "https://evil.example",
    });
  });

  it("refuses every present Origin with the default empty list", () => {
    expect(
      checkHostAndOrigin(
        { host: "localhost:3000", origin: "http://localhost:3000" },
        { ...allowed, allowedOrigins: [] },
      ),
    ).toEqual({ ok: false, header: "origin", value: "http://localhost:3000" });
  });
});
