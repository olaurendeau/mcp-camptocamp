import * as crypto from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { createTokenChecker } from "../../src/http/auth.js";

const TOKEN_1 = "3f9c1e7a5b2d4f6081a3c5e7f9b1d3e5a7c9e1f3b5d7f9a1c3e5a7b9d1f3e5a7";
const TOKEN_2 = "T0KEN-second-person-0123456789abcdef_ABCDEF~+/==";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

describe("createTokenChecker", () => {
  const check = createTokenChecker([TOKEN_1, TOKEN_2]);

  it("returns the 1-based position of the matching token", () => {
    expect(check(`Bearer ${TOKEN_1}`)).toBe(1);
    expect(check(`Bearer ${TOKEN_2}`)).toBe(2);
  });

  it("reads the scheme name case-insensitively", () => {
    expect(check(`bearer ${TOKEN_1}`)).toBe(1);
    expect(check(`BEARER ${TOKEN_2}`)).toBe(2);
    expect(check(`BeArEr ${TOKEN_1}`)).toBe(1);
  });

  it("accepts more than one space after the scheme", () => {
    expect(check(`Bearer   ${TOKEN_1}`)).toBe(1);
  });

  it("returns missing for no header, another scheme or an empty token", () => {
    expect(check(undefined)).toBe("missing");
    expect(check("")).toBe("missing");
    expect(check(`Basic ${Buffer.from(`user:${TOKEN_1}`).toString("base64")}`)).toBe("missing");
    expect(check(TOKEN_1)).toBe("missing"); // a token without a scheme
    expect(check("Bearer")).toBe("missing");
    expect(check("Bearer ")).toBe("missing");
    expect(check("Bearer    ")).toBe("missing");
  });

  it("returns invalid, without throwing, for a token that does not match", () => {
    for (const token of [
      TOKEN_1.slice(0, 40), // the right prefix with the wrong length
      `${TOKEN_1}0`, // one extra character
      `${TOKEN_1.slice(0, -1)}8`, // a different last character
      `${TOKEN_1.slice(0, -1)}é`, // non-ASCII
      "日本語のトークン",
      `${TOKEN_1} ${TOKEN_2}`, // two tokens
      "x",
    ]) {
      expect(() => check(`Bearer ${token}`)).not.toThrow();
      expect(check(`Bearer ${token}`)).toBe("invalid");
    }
  });

  it("compares 32-byte digests with timingSafeEqual against every token, with no early exit", () => {
    const timingSafeEqual = vi.mocked(crypto.timingSafeEqual);
    for (const [token, expected] of [
      [TOKEN_1, 1],
      [TOKEN_2, 2],
      ["x", "invalid"],
      [`${TOKEN_1}0`, "invalid"],
    ] as const) {
      timingSafeEqual.mockClear();
      expect(check(`Bearer ${token}`)).toBe(expected);
      expect(timingSafeEqual).toHaveBeenCalledTimes(2);
      for (const [a, b] of timingSafeEqual.mock.calls) {
        expect(a.byteLength).toBe(32);
        expect(b.byteLength).toBe(32);
      }
    }
  });

  it("matches the first position when the same token is configured twice", () => {
    expect(createTokenChecker([TOKEN_2, TOKEN_2])(`Bearer ${TOKEN_2}`)).toBe(1);
  });

  it("returns invalid for every token when none is configured", () => {
    expect(createTokenChecker([])(`Bearer ${TOKEN_1}`)).toBe("invalid");
  });
});
