import { z } from "zod";

/**
 * A Camptocamp document or user ID. Bounded to safe integers so that values such as 1e21
 * (sent as "1e+21") or 2^53 (no longer exact) are refused before any request.
 * `.max()` rather than `.safe()`, which would also add a negative minimum to the JSON Schema.
 */
export function documentId(description: string) {
  return z.number().int().positive().max(Number.MAX_SAFE_INTEGER).describe(description);
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
