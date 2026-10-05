import { describe, it, expect } from "vitest";
import { ConfigError, readHttpConfig, readTransport } from "../../src/http/config.js";

// 64 hex characters, as `openssl rand -hex 32` prints them.
const TOKEN_A = "3f9c1e7a5b2d4f6081a3c5e7f9b1d3e5a7c9e1f3b5d7f9a1c3e5a7b9d1f3e5a7";
const TOKEN_B = "Zq8-Lm2_Xv5.Tn7~Rp4+Ws1/Yk6=";
const TOKEN_B_PADDED = `${TOKEN_B.slice(0, -1)}AAAAAAAAAAAA==`; // 32+ characters, two trailing "="

function httpEnv(extra: Record<string, string> = {}): Record<string, string> {
  return { MCP_TRANSPORT: "http", MCP_AUTH_TOKENS: TOKEN_A, ...extra };
}

function configError(env: Record<string, string | undefined>): ConfigError {
  try {
    readHttpConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error("readHttpConfig did not throw");
}

describe("readTransport", () => {
  it("defaults to stdio when MCP_TRANSPORT is unset, empty or blank", () => {
    expect(readTransport({})).toBe("stdio");
    expect(readTransport({ MCP_TRANSPORT: "" })).toBe("stdio");
    expect(readTransport({ MCP_TRANSPORT: "  " })).toBe("stdio");
  });

  it("accepts stdio and http, trimmed", () => {
    expect(readTransport({ MCP_TRANSPORT: "stdio" })).toBe("stdio");
    expect(readTransport({ MCP_TRANSPORT: " http " })).toBe("http");
  });

  it("refuses any other value with a message naming the variable", () => {
    for (const value of ["htp", "HTTP", "sse"]) {
      expect(() => readTransport({ MCP_TRANSPORT: value })).toThrow(
        new ConfigError('MCP_TRANSPORT must be "stdio" or "http"'),
      );
    }
  });

  it("reads no other variable in stdio mode, so invalid HTTP settings are ignored", () => {
    const env = { MCP_HTTP_PORT: "abc", MCP_UPSTREAM_CONCURRENCY: "9", MCP_AUTH_TOKENS: "short" };
    expect(readTransport(env)).toBe("stdio");
  });
});

describe("readHttpConfig", () => {
  describe("defaults", () => {
    it("binds 127.0.0.1:3000, allows the 6 localhost hosts and no origin, with concurrency 4", () => {
      expect(readHttpConfig(httpEnv())).toEqual({
        host: "127.0.0.1",
        port: 3000,
        tokens: [TOKEN_A],
        allowedHosts: ["localhost", "localhost:3000", "127.0.0.1", "127.0.0.1:3000", "[::1]", "[::1]:3000"],
        allowedOrigins: [],
        upstreamConcurrency: 4,
        operatorContact: undefined,
      });
    });

    it("treats empty and blank variables as unset", () => {
      const env = httpEnv({
        MCP_HTTP_HOST: "",
        MCP_HTTP_PORT: " ",
        MCP_ALLOWED_HOSTS: "",
        MCP_ALLOWED_ORIGINS: "  ",
        MCP_UPSTREAM_CONCURRENCY: "",
        MCP_OPERATOR_CONTACT: " ",
      });
      expect(readHttpConfig(env)).toEqual(readHttpConfig(httpEnv()));
    });

    it("puts the configured port in the default localhost hosts", () => {
      expect(readHttpConfig(httpEnv({ MCP_HTTP_PORT: "8080" })).allowedHosts).toEqual([
        "localhost",
        "localhost:8080",
        "127.0.0.1",
        "127.0.0.1:8080",
        "[::1]",
        "[::1]:8080",
      ]);
    });
  });

  describe("values", () => {
    it("reads every variable, trimmed", () => {
      const config = readHttpConfig({
        MCP_TRANSPORT: "http",
        MCP_HTTP_HOST: " 0.0.0.0 ",
        MCP_HTTP_PORT: " 8443 ",
        MCP_AUTH_TOKENS: ` ${TOKEN_A} , ${TOKEN_B_PADDED} `,
        MCP_ALLOWED_HOSTS: " MCP.Example.org , mcp.example.org:8443 ",
        MCP_ALLOWED_ORIGINS: " https://Claude.ai , http://localhost:5173 ",
        MCP_UPSTREAM_CONCURRENCY: " 8 ",
        MCP_OPERATOR_CONTACT: " ops@example.org ",
      });
      expect(config).toEqual({
        host: "0.0.0.0",
        port: 8443,
        tokens: [TOKEN_A, TOKEN_B_PADDED],
        allowedHosts: ["mcp.example.org", "mcp.example.org:8443"],
        allowedOrigins: ["https://claude.ai", "http://localhost:5173"],
        upstreamConcurrency: 8,
        operatorContact: "ops@example.org",
      });
    });

    it("replaces the default localhost hosts when MCP_ALLOWED_HOSTS is set", () => {
      expect(readHttpConfig(httpEnv({ MCP_ALLOWED_HOSTS: "mcp.example.org" })).allowedHosts).toEqual([
        "mcp.example.org",
      ]);
    });

    it("drops empty entries from the host and origin lists", () => {
      const config = readHttpConfig(
        httpEnv({ MCP_ALLOWED_HOSTS: "a.example,, b.example,", MCP_ALLOWED_ORIGINS: ",https://a.example," }),
      );
      expect(config.allowedHosts).toEqual(["a.example", "b.example"]);
      expect(config.allowedOrigins).toEqual(["https://a.example"]);
    });

    it("accepts the port and concurrency bounds", () => {
      expect(readHttpConfig(httpEnv({ MCP_HTTP_PORT: "1" })).port).toBe(1);
      expect(readHttpConfig(httpEnv({ MCP_HTTP_PORT: "65535" })).port).toBe(65535);
      expect(readHttpConfig(httpEnv({ MCP_UPSTREAM_CONCURRENCY: "1" })).upstreamConcurrency).toBe(1);
    });

    it("accepts a token of exactly 32 characters from the RFC 6750 set, with or without trailing =", () => {
      const token32 = "abcdefghijklmnopqrstuvwxyz-._~+/";
      expect(token32).toHaveLength(32);
      expect(readHttpConfig(httpEnv({ MCP_AUTH_TOKENS: token32 })).tokens).toEqual([token32]);
      expect(readHttpConfig(httpEnv({ MCP_AUTH_TOKENS: `${token32}=` })).tokens).toEqual([`${token32}=`]);
    });

    it("accepts a contact of exactly 100 printable characters", () => {
      const contact = `${"a".repeat(90)} <b@c.org>`;
      expect(contact).toHaveLength(100);
      expect(readHttpConfig(httpEnv({ MCP_OPERATOR_CONTACT: contact })).operatorContact).toBe(contact);
    });
  });

  describe("errors", () => {
    it("requires MCP_AUTH_TOKENS when it is unset, empty or blank", () => {
      const message = "MCP_AUTH_TOKENS is required when MCP_TRANSPORT=http";
      expect(configError({ MCP_TRANSPORT: "http" }).message).toBe(message);
      expect(configError({ MCP_TRANSPORT: "http", MCP_AUTH_TOKENS: "" }).message).toBe(message);
      expect(configError({ MCP_TRANSPORT: "http", MCP_AUTH_TOKENS: "   " }).message).toBe(message);
    });

    it("names a token shorter than 32 characters by its position, never by its value", () => {
      const short = "s3cr3t-but-only-31-characters-x";
      expect(short).toHaveLength(31);
      const error = configError(httpEnv({ MCP_AUTH_TOKENS: `${TOKEN_A},${short}` }));
      expect(error.message).toBe("MCP_AUTH_TOKENS: token 2 is shorter than 32 characters");
      expect(error.message).not.toContain(short);
    });

    it("counts an empty entry in the token list as a short token", () => {
      expect(configError(httpEnv({ MCP_AUTH_TOKENS: `${TOKEN_A},,${TOKEN_A}` })).message).toBe(
        "MCP_AUTH_TOKENS: token 2 is shorter than 32 characters",
      );
    });

    it("names a token with characters outside the RFC 6750 set by its position, never by its value", () => {
      const message = "MCP_AUTH_TOKENS: token 1 has characters not allowed in a bearer token";
      for (const token of [
        `${TOKEN_A.slice(0, 40)} ${TOKEN_A.slice(40)}`, // space
        `"${TOKEN_A}"`, // quotes
        `${TOKEN_A}é`, // non-ASCII
        `${TOKEN_A.slice(0, 40)}=${TOKEN_A.slice(40)}`, // "=" not at the end
        `=${TOKEN_A}`, // only "="s before the token
        `${TOKEN_A};x`,
      ]) {
        const error = configError(httpEnv({ MCP_AUTH_TOKENS: token }));
        expect(error.message).toBe(message);
        expect(error.message).not.toContain(TOKEN_A.slice(0, 8));
      }
    });

    it("refuses a port that is not an integer from 1 to 65535", () => {
      for (const port of ["0", "65536", "abc", "-1", "3000.5", "1e3", "0x10", "+80"]) {
        expect(configError(httpEnv({ MCP_HTTP_PORT: port })).message).toBe(
          "MCP_HTTP_PORT must be an integer from 1 to 65535",
        );
      }
    });

    it("refuses a concurrency that is not an integer from 1 to 8", () => {
      for (const concurrency of ["0", "9", "four", "4.0", "-4"]) {
        expect(configError(httpEnv({ MCP_UPSTREAM_CONCURRENCY: concurrency })).message).toBe(
          "MCP_UPSTREAM_CONCURRENCY must be an integer from 1 to 8",
        );
      }
    });

    it('refuses a contact with "(", ")", ";", a control or non-ASCII character, or over 100 characters', () => {
      for (const contact of [
        "ops (team)",
        "ops) x",
        "ops@example.org; admin",
        "ops\u0007@example.org",
        "ops\t@example.org",
        "opé@example.org",
        "a".repeat(101),
      ]) {
        expect(configError(httpEnv({ MCP_OPERATOR_CONTACT: contact })).message).toBe(
          'MCP_OPERATOR_CONTACT must be printable ASCII without "(", ")" or ";", at most 100 characters',
        );
      }
    });

    it("refuses an allowed origin that is not exactly an origin", () => {
      for (const origin of [
        "https://claude.ai/",
        "https://claude.ai/path",
        "claude.ai",
        "null",
        "https://claude.ai:443",
        "https://user@claude.ai",
      ]) {
        expect(configError(httpEnv({ MCP_ALLOWED_ORIGINS: `https://ok.example,${origin}` })).message).toBe(
          `MCP_ALLOWED_ORIGINS: "${origin}" is not an origin`,
        );
      }
    });

    it("refuses an allowed host that a Host header can never equal", () => {
      for (const host of [
        "https://mcp.example.org",
        "mcp.example.org/mcp",
        "mcp.example.org:",
        "mcp.example.org:99999",
        "user@mcp.example.org",
        "mcp example.org",
        "[::1",
      ]) {
        expect(configError(httpEnv({ MCP_ALLOWED_HOSTS: `ok.example,${host}` })).message).toBe(
          `MCP_ALLOWED_HOSTS: "${host}" is not a host name with an optional port`,
        );
      }
    });

    it("accepts a host name, an IPv4 or bracketed IPv6 address, each with an optional port", () => {
      const hosts = "mcp.example.org,mcp.example.org:80,10.0.0.2:3000,[::1],[::1]:3000";
      expect(readHttpConfig(httpEnv({ MCP_ALLOWED_HOSTS: hosts })).allowedHosts).toEqual(hosts.split(","));
    });

    it("refuses an allowed host list left empty once empty entries are dropped", () => {
      for (const hosts of [",", " , ,"]) {
        expect(configError(httpEnv({ MCP_ALLOWED_HOSTS: hosts })).message).toBe(
          "MCP_ALLOWED_HOSTS must list at least one host",
        );
      }
    });

    it("throws a ConfigError, an Error subclass", () => {
      const error = configError({ MCP_TRANSPORT: "http" });
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("ConfigError");
    });
  });
});
