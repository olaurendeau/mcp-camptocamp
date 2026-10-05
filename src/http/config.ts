// Reads the MCP_* environment variables. Every value is trimmed and an empty variable counts as unset.
// No message ever contains a token: a bad token is named by its 1-based position in MCP_AUTH_TOKENS.

export type Env = Readonly<Record<string, string | undefined>>;

export type Transport = "stdio" | "http";

export interface HttpConfig {
  host: string; // bind address
  port: number;
  tokens: string[]; // in MCP_AUTH_TOKENS order: a match is logged by its position
  allowedHosts: string[]; // lowercase
  allowedOrigins: string[]; // lowercase, each exactly `new URL(x).origin`
  upstreamConcurrency: number;
  operatorContact: string | undefined;
}

// A startup error: its message goes to stderr as is and the process exits 1.
export class ConfigError extends Error {
  override name = "ConfigError";
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 8;
const MIN_TOKEN_LENGTH = 32;
const MAX_CONTACT_LENGTH = 100;
const LOCALHOST_NAMES = ["localhost", "127.0.0.1", "[::1]"];

// RFC 6750 §2.1 b64token: 1*( ALPHA / DIGIT / "-" / "." / "_" / "~" / "+" / "/" ) *"="
const BEARER_TOKEN = /^[A-Za-z0-9\-._~+/]+=*$/;
// Printable ASCII (space to "~") without "(", ")" or ";", which would break the User-Agent comment.
const CONTACT = /^[\x20-\x27\x2A-\x3A\x3C-\x7E]+$/;
const DIGITS = /^\d+$/;

// In stdio mode nothing else is read, so stray HTTP settings never stop the stdio server.
export function readTransport(env: Env): Transport {
  const value = read(env, "MCP_TRANSPORT");
  if (value === undefined || value === "stdio" || value === "http") return value ?? "stdio";
  throw new ConfigError('MCP_TRANSPORT must be "stdio" or "http"');
}

export function readHttpConfig(env: Env): HttpConfig {
  const tokens = readTokens(env);
  const port = readInteger(env, "MCP_HTTP_PORT", DEFAULT_PORT, 65535);
  const upstreamConcurrency = readInteger(env, "MCP_UPSTREAM_CONCURRENCY", DEFAULT_CONCURRENCY, MAX_CONCURRENCY);
  const operatorContact = readContact(env);
  return {
    host: read(env, "MCP_HTTP_HOST") ?? DEFAULT_HOST,
    port,
    tokens,
    allowedHosts: readHosts(env, port),
    allowedOrigins: readOrigins(env),
    upstreamConcurrency,
    operatorContact,
  };
}

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === "" ? undefined : value;
}

// Lowercase, without empty entries.
function list(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");
}

// Empty entries are kept, so a stray comma fails as a short token and positions match the variable.
function readTokens(env: Env): string[] {
  const value = read(env, "MCP_AUTH_TOKENS");
  if (value === undefined) throw new ConfigError("MCP_AUTH_TOKENS is required when MCP_TRANSPORT=http");
  const tokens = value.split(",").map((token) => token.trim());
  tokens.forEach((token, index) => {
    if (token.length < MIN_TOKEN_LENGTH) {
      throw new ConfigError(`MCP_AUTH_TOKENS: token ${index + 1} is shorter than ${MIN_TOKEN_LENGTH} characters`);
    }
    if (!BEARER_TOKEN.test(token)) {
      throw new ConfigError(`MCP_AUTH_TOKENS: token ${index + 1} has characters not allowed in a bearer token`);
    }
  });
  return tokens;
}

function readInteger(env: Env, name: string, defaultValue: number, max: number): number {
  const value = read(env, name);
  if (value === undefined) return defaultValue;
  const number = Number(value);
  if (!DIGITS.test(value) || number < 1 || number > max) {
    throw new ConfigError(`${name} must be an integer from 1 to ${max}`);
  }
  return number;
}

function readContact(env: Env): string | undefined {
  const value = read(env, "MCP_OPERATOR_CONTACT");
  if (value !== undefined && (value.length > MAX_CONTACT_LENGTH || !CONTACT.test(value))) {
    throw new ConfigError(
      `MCP_OPERATOR_CONTACT must be printable ASCII without "(", ")" or ";", at most ${MAX_CONTACT_LENGTH} characters`,
    );
  }
  return value;
}

// Setting MCP_ALLOWED_HOSTS replaces the localhost list: a public name never comes on top of it.
// Each entry must be something a Host header can equal (a name or address, an optional port), and at least
// one must be left: otherwise every request would be refused with no hint why.
function readHosts(env: Env, port: number): string[] {
  const value = read(env, "MCP_ALLOWED_HOSTS");
  if (value === undefined) return LOCALHOST_NAMES.flatMap((name) => [name, `${name}:${port}`]);
  const hosts = list(value);
  if (hosts.length === 0) throw new ConfigError("MCP_ALLOWED_HOSTS must list at least one host");
  for (const host of hosts) {
    // A scheme without a default port keeps any port as written; a scheme, path or user part changes `host`.
    const url = `x-host://${host}`;
    if (!URL.canParse(url) || new URL(url).host !== host) {
      throw new ConfigError(`MCP_ALLOWED_HOSTS: "${host}" is not a host name with an optional port`);
    }
  }
  return hosts;
}

// Browsers send an Origin as scheme://host[:port], no path and no default port: anything else never matches.
function readOrigins(env: Env): string[] {
  const value = read(env, "MCP_ALLOWED_ORIGINS");
  if (value === undefined) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      const origin = entry.toLowerCase();
      if (!URL.canParse(origin) || new URL(origin).origin !== origin) {
        throw new ConfigError(`MCP_ALLOWED_ORIGINS: "${entry}" is not an origin`);
      }
      return origin;
    });
}
