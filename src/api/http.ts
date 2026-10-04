import type { z } from "zod";
import { VERSION } from "../version.js";

export const BASE_URL = "https://api.camptocamp.org";

const ERROR_PREFIX = "Camptocamp API error:";
const MAX_REASON_LENGTH = 200;
const TIMEOUT_MS = 15_000;
const TIMED_OUT = `request timed out after ${TIMEOUT_MS / 1000} s`;
const MAX_BODY_BYTES = 10 * 1024 * 1024; // the largest known response, area 14067, is about 1.1 MB
const TOO_LARGE = "too large (over 10 MiB)";
const HEADERS = {
  "User-Agent": `mcp-camptocamp/${VERSION} (+https://github.com/olaurendeau/mcp-camptocamp)`,
  Accept: "application/json",
};

export type DocumentType = "route" | "waypoint" | "outing" | "area" | "book" | "article";

export interface JsonRequest<S extends z.ZodTypeAny> {
  path: string; // starts with "/", e.g. "/routes/123"
  params?: URLSearchParams;
  schema: S; // expected shape of a 200 body; keys it does not declare are dropped
  document?: { type: DocumentType; id: number }; // the requested document, named in HTTP error messages
}

// An HTTP error status, with a message already final: it says why the error body was not used, timeout included.
class HttpStatusError extends Error {}

class BodyTooLargeError extends Error {}

// The only place that calls the Camptocamp API: every endpoint goes through here.
// A global setTimeout (not AbortSignal.timeout, which fake timers cannot drive) aborts the request
// after 15 s; it covers the fetch, the body read and its validation.
export async function getJson<S extends z.ZodTypeAny>(request: JsonRequest<S>): Promise<z.infer<S>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchJson(request, controller.signal);
  } catch (error) {
    // Once our timer has fired, whatever failed (fetch, body read) failed because of it
    if (controller.signal.aborted && !(error instanceof HttpStatusError)) {
      throw new Error(`${ERROR_PREFIX} ${TIMED_OUT}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<S extends z.ZodTypeAny>(
  { path, params, schema, document }: JsonRequest<S>,
  signal: AbortSignal,
): Promise<z.infer<S>> {
  const query = params?.toString();
  let response: Response;
  try {
    response = await fetch(query ? `${BASE_URL}${path}?${query}` : `${BASE_URL}${path}`, {
      headers: HEADERS,
      signal,
    });
  } catch (error) {
    throw new Error(`${ERROR_PREFIX} network error (${networkErrorDetail(error)})`);
  }
  if (!response.ok) {
    throw new HttpStatusError(await httpErrorMessage(response, document, signal));
  }
  let text: string;
  try {
    text = await readCappedBody(response);
  } catch (error) {
    throw error instanceof BodyTooLargeError ? new Error(`${ERROR_PREFIX} response ${TOO_LARGE}`) : error;
  }
  return parseBody(text, schema);
}

// Reads at most MAX_BODY_BYTES: a larger Content-Length is refused without reading the body, and a body
// streamed without one (gzip/chunked, like area 14067) is cancelled as soon as its byte count goes over.
async function readCappedBody(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_BODY_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new BodyTooLargeError();
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder(); // UTF-8; `stream: true` keeps a character split across chunks whole
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
}

// A 200 body that is not JSON or not the expected shape is an error here, rather than a
// "Cannot read properties of undefined" later in a formatter.
function parseBody<S extends z.ZodTypeAny>(text: string, schema: S): z.infer<S> {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${ERROR_PREFIX} unexpected response (not JSON)`);
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const [issue] = result.error.issues;
    const location = issue.path.join(".");
    throw new Error(`${ERROR_PREFIX} unexpected response (${location ? `${location}: ` : ""}${issue.message})`);
  }
  return result.data;
}

// fetch rejects with TypeError("fetch failed") and puts the useful part (e.g. code ENOTFOUND) in `cause`.
function networkErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause: unknown = error.cause;
  if (typeof cause === "object" && cause !== null) {
    if ("code" in cause && typeof cause.code === "string") return cause.code;
    if ("message" in cause && typeof cause.message === "string") return cause.message;
  }
  return error.message;
}

// `<prefix> <status> <statusText>[ (<type> <id>)][: <reason>]`; the reason comes only from a JSON
// `errors[].description` body, never from raw body text (some error bodies are HTML pages), or says why
// the body could not be read (timeout, over the cap) so the status is never lost.
async function httpErrorMessage(
  response: Response,
  document: JsonRequest<z.ZodTypeAny>["document"],
  signal: AbortSignal,
): Promise<string> {
  const status = [String(response.status), response.statusText].filter(Boolean).join(" ");
  const documentPart = document ? ` (${document.type} ${document.id})` : "";
  let reason: string | undefined;
  try {
    reason = errorReason(await readCappedBody(response));
  } catch (error) {
    if (signal.aborted) reason = `${TIMED_OUT} while reading the error body`;
    else if (error instanceof BodyTooLargeError) reason = `error body ${TOO_LARGE}`;
    // otherwise unreadable: the status line alone
  }
  return `${ERROR_PREFIX} ${status}${documentPart}${reason ? `: ${reason}` : ""}`;
}

function errorReason(text: string): string | undefined {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return undefined; // empty or not JSON
  }
  if (typeof body !== "object" || body === null || !("errors" in body) || !Array.isArray(body.errors)) {
    return undefined;
  }
  const descriptions = body.errors
    .map((error: unknown) =>
      typeof error === "object" && error !== null && "description" in error && typeof error.description === "string"
        ? error.description.replace(/\s+/g, " ").trim()
        : "",
    )
    .filter((description) => description !== "");
  return descriptions.length > 0 ? truncate(descriptions.join("; "), MAX_REASON_LENGTH) : undefined;
}

function truncate(text: string, maxLength: number): string {
  const characters = Array.from(text); // code points, so a cut never splits a surrogate pair
  return characters.length <= maxLength ? text : `${characters.slice(0, maxLength - 1).join("")}…`;
}
