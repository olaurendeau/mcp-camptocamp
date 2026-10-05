// Parallel API calls for the tools that read several documents in one call (get_outings, S1 of #255).
// Each call still goes through getJson, with its User-Agent, 15 s timeout and 10 MiB cap, and in HTTP mode
// also waits for a slot under the process-wide upstream cap (src/api/upstream.ts), shared by every client.

// The most requests one tool call sends to Camptocamp at a time.
export const MAX_PARALLEL_REQUESTS = 3;

/**
 * Calls `fn` on every item, at most `limit` at a time, and returns the results in input order. A call
 * starts as soon as another ends. On the first failure it rejects at once and starts no new call;
 * calls already in flight run to their end, their results dropped.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${String(limit)}`);
  }
  const results: R[] = new Array<R>(items.length);
  // One iterator shared by the workers: each takes the next item when its call ends.
  const queue = items.entries();
  let failed = false;

  async function worker(): Promise<void> {
    while (!failed) {
      const next = queue.next();
      if (next.done) return;
      const [index, item] = next.value;
      try {
        results[index] = await fn(item);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
