import { z } from "zod";

/**
 * A Camptocamp document or user ID. Bounded to safe integers so that values such as 1e21
 * (sent as "1e+21") or 2^53 (no longer exact) are refused before any request.
 * `.max()` rather than `.safe()`, which would also add a negative minimum to the JSON Schema.
 */
export function documentId(description: string) {
  return z.number().int().positive().max(Number.MAX_SAFE_INTEGER).describe(description);
}
