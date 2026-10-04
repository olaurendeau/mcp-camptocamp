import type { z } from "zod";

export const BASE_URL = "https://api.camptocamp.org";

const ERROR_PREFIX = "Camptocamp API error:";
const MAX_REASON_LENGTH = 200;

export type DocumentType = "route" | "waypoint" | "outing" | "area" | "book" | "article";

export interface JsonRequest<S extends z.ZodTypeAny> {
  path: string; // starts with "/", e.g. "/routes/123"
  params?: URLSearchParams;
  schema: S; // expected shape of a 200 body; keys it does not declare are dropped
  document?: { type: DocumentType; id: number }; // the requested document, named in HTTP error messages
}

// The only place that calls the Camptocamp API: every endpoint goes through here.
export async function getJson<S extends z.ZodTypeAny>({
  path,
  params,
  schema,
  document,
}: JsonRequest<S>): Promise<z.infer<S>> {
  const query = params?.toString();
  let response: Response;
  try {
    response = await fetch(query ? `${BASE_URL}${path}?${query}` : `${BASE_URL}${path}`);
  } catch (error) {
    throw new Error(`${ERROR_PREFIX} network error (${networkErrorDetail(error)})`);
  }
  if (!response.ok) {
    throw new Error(await httpErrorMessage(response, document));
  }
  return parseBody(await response.text(), schema);
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

// `<prefix> <status> <statusText>[ (<type> <id>)][: <API reason>]`; the reason comes only from a JSON
// `errors[].description` body, never from raw body text (some error bodies are HTML pages).
async function httpErrorMessage(response: Response, document: JsonRequest<z.ZodTypeAny>["document"]): Promise<string> {
  const status = [String(response.status), response.statusText].filter(Boolean).join(" ");
  const documentPart = document ? ` (${document.type} ${document.id})` : "";
  const reason = await readErrorReason(response);
  return `${ERROR_PREFIX} ${status}${documentPart}${reason ? `: ${reason}` : ""}`;
}

async function readErrorReason(response: Response): Promise<string | undefined> {
  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    return undefined; // unreadable, empty or not JSON
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
