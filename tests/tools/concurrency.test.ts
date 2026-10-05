import { describe, it, expect } from "vitest";
import { MAX_PARALLEL_REQUESTS, mapWithConcurrency } from "../../src/tools/concurrency.js";

// A call that stays in flight until the test settles it, so the test controls the completion order.
interface Pending {
  item: number;
  resolve(value: string): void;
  reject(error: Error): void;
}

function controlledCalls() {
  const pending: Pending[] = [];
  const started: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fn = (item: number) =>
    new Promise<string>((resolve, reject) => {
      started.push(item);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const settle = () => {
        inFlight--;
      };
      pending.push({
        item,
        resolve: (value) => {
          settle();
          resolve(value);
        },
        reject: (error) => {
          settle();
          reject(error);
        },
      });
    });
  return { fn, pending, started, maxInFlight: () => maxInFlight };
}

// Lets every settled promise run its continuations, so the next calls start.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("mapWithConcurrency", () => {
  it("caps parallel requests at 3", () => {
    expect(MAX_PARALLEL_REQUESTS).toBe(3);
  });

  it("returns the results in input order, whatever order the calls finish in", async () => {
    const calls = controlledCalls();
    const result = mapWithConcurrency([1, 2, 3, 4, 5], 3, calls.fn);

    await flush();
    // Settle the running calls last-first, then the ones they let start.
    while (calls.pending.length > 0) {
      const call = calls.pending.pop();
      call?.resolve(`r${String(call.item)}`);
      await flush();
    }

    await expect(result).resolves.toEqual(["r1", "r2", "r3", "r4", "r5"]);
  });

  it("never has more than the limit in flight, and starts the next call as soon as one ends", async () => {
    const calls = controlledCalls();
    const result = mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, calls.fn);

    await flush();
    expect(calls.started).toEqual([1, 2, 3]);

    calls.pending.shift()?.resolve("done");
    await flush();
    expect(calls.started).toEqual([1, 2, 3, 4]);

    while (calls.pending.length > 0) {
      calls.pending.shift()?.resolve("done");
      await flush();
    }
    await result;

    expect(calls.started).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(calls.maxInFlight()).toBe(3);
  });

  it("starts every call at once when there are fewer items than the limit", async () => {
    const calls = controlledCalls();
    const result = mapWithConcurrency([1, 2], 3, calls.fn);

    await flush();
    expect(calls.started).toEqual([1, 2]);
    for (const call of calls.pending) call.resolve("done");

    await expect(result).resolves.toEqual(["done", "done"]);
  });

  it("rejects on the first failure without waiting for the calls in flight, and starts no new call", async () => {
    const calls = controlledCalls();
    const result = mapWithConcurrency([1, 2, 3, 4, 5], 3, calls.fn);

    await flush();
    calls.pending[1].reject(new Error("boom on 2"));

    await expect(result).rejects.toThrow("boom on 2");
    // Calls 1 and 3 are still in flight; once they end, no call 4 or 5 starts.
    calls.pending[0].resolve("done");
    calls.pending[2].resolve("done");
    await flush();
    expect(calls.started).toEqual([1, 2, 3]);
  });

  it("returns an empty list for no items, without calling fn", async () => {
    const calls = controlledCalls();

    await expect(mapWithConcurrency([], 3, calls.fn)).resolves.toEqual([]);
    expect(calls.started).toEqual([]);
  });

  it.each([0, -1, 1.5])("refuses the limit %d", async (limit) => {
    await expect(mapWithConcurrency([1], limit, () => Promise.resolve(1))).rejects.toThrow(
      `limit must be a positive integer, got ${String(limit)}`,
    );
  });
});
