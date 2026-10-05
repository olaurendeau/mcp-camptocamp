import { z } from "zod";
import { LANGS, enumValue } from "./enums.js";
import { LANG_ORDER } from "./format.js";

/**
 * A Camptocamp document or user ID. Bounded to safe integers so that values such as 1e21
 * (sent as "1e+21") or 2^53 (no longer exact) are refused before any request.
 * `.max()` rather than `.safe()`, which would also add a negative minimum to the JSON Schema.
 */
export function documentId(description: string) {
  return z.number().int().positive().max(Number.MAX_SAFE_INTEGER).describe(description);
}

/**
 * A list of 1 to `max` Camptocamp document IDs, each bounded like `documentId`. The items have no description of
 * their own: the list's description says what they are.
 */
export function documentIdList(description: string, max: number) {
  return z
    .array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
    .min(1, "must list at least 1 ID")
    .max(max, `must list at most ${String(max)} IDs`)
    .describe(description);
}

/** Longest free-text search query sent to Camptocamp; longer ones get an HTML 400 upstream. */
export const MAX_QUERY_LENGTH = 200;

/**
 * A free-text search query, at most MAX_QUERY_LENGTH characters.
 * `allowBlank: false` refuses "" and whitespace-only queries, which Camptocamp treats like no
 * query at all (a listing of the whole collection). Tools where the query is optional pass
 * `allowBlank: true` and treat a blank query as missing in their handler.
 */
export function searchQuery(description: string, options: { allowBlank: true }): z.ZodString;
export function searchQuery(description: string, options: { allowBlank: false }): z.ZodEffects<z.ZodString>;
export function searchQuery(description: string, { allowBlank }: { allowBlank: boolean }) {
  const query = z.string().max(MAX_QUERY_LENGTH);
  if (allowBlank) return query.describe(description);
  return query.refine((s) => s.trim() !== "", "must not be blank").describe(description);
}

/**
 * The language of the titles and texts returned. A factory, not a shared instance, so that the JSON Schema has
 * no `$ref`; no zod default, which would make `lang` required in every handler's input type: handlers fall back
 * to fr (pickLocale's default), as the description says.
 */
export function langInput() {
  return enumValue(LANGS)
    .optional()
    .describe(`Language of titles and texts, one of: ${LANGS.join(", ")} (default fr)`);
}

/** The tool-description sentence on `lang`: its default and the fallback order (AC5.10 on #153). */
export const LANG_NOTE =
  `lang (default fr) picks the language of titles and texts; when a document has no text in it, the first ` +
  `available of ${LANG_ORDER.join(", ")} is used. Labels and codes stay in English.`;

/**
 * The tool-description sentences on the Language line (decision D3 on #153) and the Text in other languages line
 * (D1 on #210) of the get_* tools.
 */
export const DETAIL_LANG_NOTE =
  "After the URL, '**Language**: en (no de version; available: it, en)' says the requested language is missing " +
  "and which exist, and '**Text in other languages**: gear (de, en)' lists sections written only in other " +
  "languages: call again with one of those lang values to read them. Language versions are written separately " +
  "and may differ.";

/** Results to skip in a search, for paging; handlers check offset + limit with `assertResultWindow`. */
export function searchOffset() {
  return z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Number of results to skip, for paging (offset + limit ≤ 10,000)");
}
