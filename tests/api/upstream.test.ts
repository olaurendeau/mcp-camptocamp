import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { getJson } from "../../src/api/http.js";
import {
  BUSY_MESSAGE,
  UpstreamBusyError,
  configureUpstream,
  runInRequestContext,
  userAgent,
  withUpstreamSlot,
  type RequestContext,
} from "../../src/api/upstream.js";
import { VERSION } from "../../src/version.js";

const anySchema = z.unknown();

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Fake timers everywhere: the 20 s wait and the 15 s timeout are driven by hand, and flush() needs them.
beforeEach(() => {
  mockFetch.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  configureUpstream(undefined);
  vi.useRealTimers();
});

// A fetch the test settles by hand. It rejects like undici once its signal aborts.
interface Call {
  url: string;
  signal: AbortSignal;
  settled(): boolean;
  resolve(response: Response): void;
}

function deferredFetch() {
  const calls: Call[] = [];
  let pending = 0;
  let maxPending = 0;
  mockFetch.mockImplementation(
    (url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init.signal as AbortSignal;
        let settled = false;
        const settle = () => {
          if (settled) return false;
          settled = true;
          pending--;
          return true;
        };
        pending++;
        maxPending = Math.max(maxPending, pending);
        signal.addEventListener("abort", () => {
          if (settle()) reject(signal.reason as Error);
        });
        calls.push({
          url,
          signal,
          settled: () => settled,
          resolve: (response) => {
            if (settle()) resolve(response);
          },
        });
      }),
  );
  return { calls, pending: () => pending, maxPending: () => maxPending };
}

const ok = () => new Response("{}", { status: 200, statusText: "OK" });

// Lets every settled promise run its continuations (fake timers included: advanceTimersByTimeAsync(0)).
const flush = () => vi.advanceTimersByTimeAsync(0);

// Starts a request whose outcome the test reads later, so an early rejection is never unhandled.
function start(path: string) {
  const outcome = getJson({ path, schema: anySchema }).then(
    (value: unknown) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  return outcome;
}

const paths = (calls: Call[]) => calls.map((call) => new URL(call.url).pathname);

describe("withUpstreamSlot before configureUpstream", () => {
  it("calls fn at once with no signal", async () => {
    const fn = vi.fn((signal: AbortSignal | undefined) => Promise.resolve(signal));

    await expect(withUpstreamSlot(fn)).resolves.toBeUndefined();
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe("upstream cap", () => {
  it("never has more than 4 requests pending and starts them in FIFO order", async () => {
    configureUpstream({ concurrency: 4 });
    const fetches = deferredFetch();
    const requests = Array.from({ length: 20 }, (_, i) => start(`/routes/${String(i + 1)}`));

    await flush();
    expect(paths(fetches.calls)).toEqual(["/routes/1", "/routes/2", "/routes/3", "/routes/4"]);

    // End the newest first: the freed slot still goes to the oldest waiter.
    while (fetches.calls.length < 20 || fetches.pending() > 0) {
      fetches.calls
        .filter((call) => !call.settled())
        .at(-1)
        ?.resolve(ok());
      await flush();
      expect(fetches.pending()).toBeLessThanOrEqual(4);
    }
    const outcomes = await Promise.all(requests);

    expect(paths(fetches.calls)).toEqual(Array.from({ length: 20 }, (_, i) => `/routes/${String(i + 1)}`));
    expect(fetches.maxPending()).toBe(4);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
  });

  it("refuses the request after 4 in flight and 50 queued with exactly the busy message, without fetching", async () => {
    configureUpstream({ concurrency: 4 });
    const fetches = deferredFetch();
    const requests = Array.from({ length: 54 }, (_, i) => start(`/routes/${String(i + 1)}`));
    await flush();

    const refused = await start("/routes/55");

    expect(refused.ok).toBe(false);
    const error = (refused as { error: unknown }).error;
    expect(error).toBeInstanceOf(UpstreamBusyError);
    expect(error).toEqual(new UpstreamBusyError());
    expect((error as Error).message).toBe(
      "this server is busy (too many Camptocamp requests in progress); try again shortly.",
    );
    expect(mockFetch).toHaveBeenCalledTimes(4);

    // Every queued request still runs once slots free up.
    while (fetches.calls.length < 54 || fetches.pending() > 0) {
      for (const call of fetches.calls) call.resolve(ok());
      await flush();
    }
    const outcomes = await Promise.all(requests);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(54);
  });

  it("refuses a waiter after 20 s with the busy message, and never fetches for it", async () => {
    configureUpstream({ concurrency: 1 });
    mockFetch.mockImplementation(() => new Promise(() => undefined)); // never answers, even to an abort
    void start("/routes/1");
    let settled = false;
    const waiter = start("/routes/2").finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const outcome = await waiter;
    expect(outcome).toEqual({ ok: false, error: new UpstreamBusyError() });
    expect((outcome as { error: Error }).error.message).toBe(BUSY_MESSAGE);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("starts the 15 s timeout only once the slot is granted", async () => {
    configureUpstream({ concurrency: 1 });
    const fetches = deferredFetch();
    const first = start("/routes/1");
    let settled = false;
    const second = start("/routes/2").finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(10_000);
    fetches.calls[0].resolve(ok());
    await expect(first).resolves.toEqual({ ok: true, value: {} });
    expect(paths(fetches.calls)).toEqual(["/routes/1", "/routes/2"]);

    await vi.advanceTimersByTimeAsync(14_999); // 24.999 s after the call, 14.999 s after the grant
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await second).toEqual({
      ok: false,
      error: new Error("Camptocamp API error: request timed out after 15 s"),
    });
  });

  it("gives the slot back after a timeout", async () => {
    configureUpstream({ concurrency: 1 });
    const fetches = deferredFetch();
    const first = start("/routes/1");
    void start("/routes/2");

    await vi.advanceTimersByTimeAsync(15_000);

    expect((await first).ok).toBe(false);
    expect(paths(fetches.calls)).toEqual(["/routes/1", "/routes/2"]);
  });

  it.each([
    ["a success", () => Promise.resolve(ok()), true],
    ["an HTTP error", () => Promise.resolve(new Response("", { status: 500, statusText: "Error" })), false],
    ["a network error", () => Promise.reject(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } })), false],
    [
      "a body over 10 MiB",
      () =>
        Promise.resolve(
          new Response("{}", {
            status: 200,
            statusText: "OK",
            headers: { "Content-Length": String(20 * 1024 * 1024) },
          }),
        ),
      false,
    ],
  ])("gives the slot back after %s", async (_label, firstFetch, succeeds) => {
    configureUpstream({ concurrency: 1 });
    mockFetch.mockImplementationOnce(firstFetch).mockImplementationOnce(() => Promise.resolve(ok()));

    const first = start("/routes/1");
    const second = start("/routes/2");

    expect((await first).ok).toBe(succeeds);
    expect(await second).toEqual({ ok: true, value: {} });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("refuses a value that is not a positive integer", () => {
    expect(() => {
      configureUpstream({ concurrency: 0 });
    }).toThrow(new RangeError("concurrency must be a positive integer, got 0"));
    expect(() => {
      configureUpstream({ concurrency: 1.5 });
    }).toThrow(RangeError);
  });

  it("goes back to no cap with configureUpstream(undefined)", async () => {
    configureUpstream({ concurrency: 1 });
    configureUpstream(undefined);
    const fetches = deferredFetch();

    void start("/routes/1");
    void start("/routes/2");
    await flush();

    expect(fetches.calls).toHaveLength(2);
    for (const call of fetches.calls) call.resolve(ok());
  });
});

describe("request context", () => {
  function context(): { context: RequestContext; controller: AbortController } {
    const controller = new AbortController();
    return { context: { upstreamRequests: 0, signal: controller.signal }, controller };
  }

  it("aborting a context aborts its fetch in flight and drops its waiters, and others move up", async () => {
    configureUpstream({ concurrency: 1 });
    const fetches = deferredFetch();
    const a = context();
    const b = context();
    const reason = new Error("client went away");

    const a1 = runInRequestContext(a.context, () => start("/routes/1"));
    const a2 = runInRequestContext(a.context, () => start("/routes/2"));
    const b1 = runInRequestContext(b.context, () => start("/routes/3"));
    await flush();
    expect(paths(fetches.calls)).toEqual(["/routes/1"]);

    a.controller.abort(reason);
    await flush();

    expect(fetches.calls[0].signal.aborted).toBe(true);
    expect(await a1).toEqual({ ok: false, error: reason });
    expect(await a2).toEqual({ ok: false, error: reason });
    expect(paths(fetches.calls)).toEqual(["/routes/1", "/routes/3"]);
    fetches.calls[1].resolve(ok());
    expect(await b1).toEqual({ ok: true, value: {} });
    expect(a.context.upstreamRequests).toBe(1);
    expect(b.context.upstreamRequests).toBe(1);
  });

  it("refuses a call in an aborted context without fetching", async () => {
    configureUpstream({ concurrency: 4 });
    const a = context();
    a.controller.abort();

    const outcome = await runInRequestContext(a.context, () => start("/routes/1"));

    expect(outcome.ok).toBe(false);
    expect((outcome as { error: Error }).error.name).toBe("AbortError");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(a.context.upstreamRequests).toBe(0);
  });

  it("wraps an abort reason that is not an Error", async () => {
    configureUpstream({ concurrency: 4 });
    const fetches = deferredFetch();
    const a = context();
    const request = runInRequestContext(a.context, () => start("/routes/1"));
    await flush();

    a.controller.abort("shutdown");

    const { error } = (await request) as { error: Error };
    expect(error.message).toBe("request aborted");
    expect(error.cause).toBe("shutdown");
    expect(fetches.calls[0].signal.aborted).toBe(true);
  });

  it("counts real fetches only: not a refused call", async () => {
    configureUpstream({ concurrency: 1 });
    const fetches = deferredFetch();
    const a = context();
    const requests = runInRequestContext(a.context, () =>
      Array.from({ length: 52 }, (_, i) => start(`/routes/${String(i + 1)}`)),
    );
    await flush();

    expect((await requests[51]).ok).toBe(false); // 1 in flight, 50 queued: the 52nd is refused
    for (let i = 0; i < 51; i++) {
      fetches.calls[i].resolve(ok());
      await flush();
    }
    await Promise.all(requests);

    expect(a.context.upstreamRequests).toBe(51);
  });

  it("applies without a cap too: counts and aborts", async () => {
    const fetches = deferredFetch();
    const a = context();
    const request = runInRequestContext(a.context, () => start("/routes/1"));
    await flush();

    a.controller.abort();

    expect((await request).ok).toBe(false);
    expect(fetches.calls[0].signal.aborted).toBe(true);
    expect(a.context.upstreamRequests).toBe(1);
  });
});

describe("userAgent", () => {
  const repo = "https://github.com/olaurendeau/mcp-camptocamp";

  it("is today's User-Agent before configureUpstream", () => {
    expect(userAgent()).toBe(`mcp-camptocamp/${VERSION} (+${repo})`);
  });

  it("marks a self-hosted instance", () => {
    configureUpstream({ concurrency: 4 });

    expect(userAgent()).toBe(`mcp-camptocamp/${VERSION} (+${repo}; self-hosted)`);
  });

  it("adds the operator contact", async () => {
    configureUpstream({ concurrency: 4, operatorContact: "ops@example.org" });
    mockFetch.mockResolvedValueOnce(ok());

    await getJson({ path: "/routes/1", schema: anySchema });

    const expected = `mcp-camptocamp/${VERSION} (+${repo}; self-hosted; contact: ops@example.org)`;
    expect(userAgent()).toBe(expected);
    expect(new Headers((mockFetch.mock.calls[0][1] as RequestInit).headers).get("User-Agent")).toBe(expected);
  });
});
