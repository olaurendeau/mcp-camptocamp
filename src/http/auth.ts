import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// "missing": no Bearer credentials (no header, another scheme, an empty token); "invalid": a Bearer token
// that matches no configured token; otherwise the 1-based position of the matching token in MCP_AUTH_TOKENS.
export type AuthResult = "missing" | "invalid" | number;

// Generated once per process and never exposed: digests cannot be precomputed or compared across runs.
const HMAC_KEY = randomBytes(32);

// Every token, presented or configured, is reduced to a 32-byte HMAC-SHA256 digest, so timingSafeEqual
// always compares equal lengths and neither a token's length nor its first differing character can leak.
function digest(token: string): Buffer {
  return createHmac("sha256", HMAC_KEY).update(token, "utf8").digest();
}

// RFC 6750 §2.1: `Bearer 1*SP token`, the scheme name case-insensitive (RFC 9110 §11.1).
const BEARER = /^bearer +(.*)$/i;

export function createTokenChecker(tokens: readonly string[]): (authorization: string | undefined) => AuthResult {
  const digests = tokens.map(digest);
  return (authorization) => {
    const token = (authorization === undefined ? undefined : BEARER.exec(authorization))?.[1]?.trim();
    if (!token) return "missing";
    const presented = digest(token);
    let position = 0;
    // No early exit: every configured token is compared, whichever one matches.
    digests.forEach((configured, index) => {
      const match = timingSafeEqual(presented, configured);
      position = match && position === 0 ? index + 1 : position;
    });
    return position === 0 ? "invalid" : position;
  };
}
