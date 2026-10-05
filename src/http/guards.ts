import type { IncomingHttpHeaders } from "node:http";

// The MCP spec's Streamable HTTP "Security Warning": validate Origin (against DNS rebinding) and only
// serve the expected Host. Both lists come from the config, already lowercase.

export interface AllowedSources {
  allowedHosts: readonly string[];
  allowedOrigins: readonly string[];
}

export type GuardResult = { ok: true } | { ok: false; header: "host" | "origin"; value: string };

// A missing Host is refused: HTTP/1.1 requires one, and without it nothing tells which name was used.
export function isHostAllowed(host: string | undefined, allowedHosts: readonly string[]): boolean {
  return host !== undefined && allowedHosts.includes(host.toLowerCase());
}

// A missing Origin passes (non-browser clients send none); a present one must be listed, so with the
// default empty list every present Origin is refused, "null" included.
export function isOriginAllowed(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  return origin === undefined || allowedOrigins.includes(origin.toLowerCase());
}

// Host first, then Origin. A refusal carries the header's value, for the operator's log line.
export function checkHostAndOrigin(headers: IncomingHttpHeaders, allowed: AllowedSources): GuardResult {
  const { host, origin } = headers;
  if (!isHostAllowed(host, allowed.allowedHosts)) return { ok: false, header: "host", value: host ?? "" };
  if (origin !== undefined && !isOriginAllowed(origin, allowed.allowedOrigins)) {
    return { ok: false, header: "origin", value: origin };
  }
  return { ok: true };
}
