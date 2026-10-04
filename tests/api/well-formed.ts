import { isMalformed, type MalformedItem } from "../../src/api/schemas.js";

/**
 * The items of a list parsed by tolerantArray, typed as well-formed: fails when one of them is a
 * MalformedItem. A missing list gives [].
 */
export function wellFormed<T extends object>(items: readonly (T | MalformedItem)[] | null | undefined): T[] {
  const list = items ?? [];
  const malformed = list.filter((item) => isMalformed(item));
  if (malformed.length > 0) throw new Error(`malformed items: ${JSON.stringify(malformed)}`);
  return list.filter((item): item is T => !isMalformed(item));
}
