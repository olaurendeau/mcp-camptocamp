import { describe, it, expect, vi, afterEach } from "vitest";
import { configureUpstream } from "../../src/api/upstream.js";
import { MAX_PARALLEL_REQUESTS, mapWithConcurrency } from "../../src/tools/concurrency.js";
import { handleGetOutings } from "../../src/tools/outings.js";
import { collectMatchingOutings } from "../../src/tools/outing-stats.js";

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

// AC7.1 on #277: the process-wide upstream cap (HTTP mode) also holds the parallel calls of one tool call.
describe("tools that read several documents, under an upstream cap of 2", () => {
  const mockFetch = vi.fn();

  afterEach(() => {
    configureUpstream(undefined);
    vi.unstubAllGlobals();
  });

  // Answers each request after a few milliseconds, with the body built from its URL, counting the pending ones.
  function slowFetch(body: (url: URL) => unknown) {
    let pending = 0;
    let maxPending = 0;
    mockFetch.mockImplementation(async (url: string) => {
      pending++;
      maxPending = Math.max(maxPending, pending);
      await new Promise((resolve) => setTimeout(resolve, 2));
      pending--;
      return new Response(JSON.stringify(body(new URL(url))), { status: 200, statusText: "OK" });
    });
    vi.stubGlobal("fetch", mockFetch);
    return { maxPending: () => maxPending };
  }

  // Shaped like GET /outings/1924138 (2026-10-05), with only the required fields and a title.
  function outingDetail(id: number) {
    return {
      document_id: id,
      locales: [{ lang: "fr", title: `Sortie ${String(id)}` }],
      activities: ["mountain_climbing"],
    };
  }

  it("get_outings with 10 IDs never has more than 2 requests pending", async () => {
    configureUpstream({ concurrency: 2 });
    const fetches = slowFetch((url) => outingDetail(Number(url.pathname.split("/").at(-1))));
    const ids = Array.from({ length: 10 }, (_, i) => 1924130 + i);

    const output = await handleGetOutings({ ids });

    expect(mockFetch).toHaveBeenCalledTimes(10);
    expect(fetches.maxPending()).toBe(2);
    for (const id of ids) expect(output).toContain(`Sortie ${String(id)}`);
    expect(output).not.toContain("Error:");
  });

  it("collecting 5 pages of outings never has more than 2 requests pending", async () => {
    configureUpstream({ concurrency: 2 });
    // Shaped like the items of GET /outings?sort=-date_end,-id&limit=100 (2026-10-05), without the optional fields.
    const fetches = slowFetch((url) => {
      const offset = Number(url.searchParams.get("offset"));
      return {
        total: 500,
        documents: Array.from({ length: 100 }, (_, i) => ({
          document_id: offset + i + 1,
          locales: [{ lang: "fr", title: "Mont Blanc : Arête de l'Innominata" }],
          activities: ["mountain_climbing"],
        })),
      };
    });

    const result = await collectMatchingOutings({ activity: "mountain_climbing" });

    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(fetches.maxPending()).toBe(2);
    expect(result.documents).toHaveLength(500);
  });
});
