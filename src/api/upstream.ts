// Protects the volunteer-run Camptocamp API from one self-hosted instance (S7 of #277): a process-wide cap on
// requests in flight, with a short FIFO queue, and a User-Agent naming the instance and its operator.
// Inactive until configureUpstream is called, which only the HTTP mode does: stdio keeps no cap, no queue
// and today's User-Agent.
import { AsyncLocalStorage } from "node:async_hooks";
import { VERSION } from "../version.js";

export const BUSY_MESSAGE = "this server is busy (too many Camptocamp requests in progress); try again shortly.";

// Not a Camptocamp API error: the request never left this server, so its message has no API error prefix.
export class UpstreamBusyError extends Error {
  constructor() {
    super(BUSY_MESSAGE);
    this.name = "UpstreamBusyError";
  }
}

const MAX_QUEUED = 50;
const MAX_WAIT_MS = 20_000;
const PRODUCT = `mcp-camptocamp/${VERSION}`;
const REPOSITORY = "https://github.com/olaurendeau/mcp-camptocamp";

export interface UpstreamConfig {
  concurrency: number; // the most Camptocamp requests in flight at once, across every client
  operatorContact?: string; // already checked by the HTTP settings: printable ASCII, no "()", ";" or "\"
}

interface Waiter {
  grant(): void;
}

// At most `concurrency` slots; a freed slot goes straight to the oldest waiter.
class Limiter {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(private readonly concurrency: number) {}

  get queued(): number {
    return this.waiters.length;
  }

  acquire(signal: AbortSignal | undefined): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    if (this.waiters.length >= MAX_QUEUED) return Promise.reject(new UpstreamBusyError());
    return new Promise((resolve, reject) => {
      const leave = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
      };
      const onAbort = () => {
        leave();
        reject(abortReason(signal as AbortSignal));
      };
      const timer = setTimeout(() => {
        leave();
        reject(new UpstreamBusyError());
      }, MAX_WAIT_MS);
      const waiter: Waiter = {
        grant: () => {
          leave();
          resolve();
        },
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  release(): void {
    const next = this.waiters[0];
    if (next)
      next.grant(); // the slot changes hands: `active` stays the same
    else this.active--;
  }
}

let limiter: Limiter | undefined;
let operatorContact: string | undefined;
let configured = false;

/** Turns the cap and the self-hosted User-Agent on; `undefined` turns them off again (stdio behaviour). */
export function configureUpstream(config: UpstreamConfig | undefined): void {
  if (config && (!Number.isInteger(config.concurrency) || config.concurrency < 1)) {
    throw new RangeError(`concurrency must be a positive integer, got ${String(config.concurrency)}`);
  }
  configured = config !== undefined;
  limiter = config ? new Limiter(config.concurrency) : undefined;
  operatorContact = config?.operatorContact;
}

/** For tests: how many Camptocamp requests wait for a slot right now (0 while no cap is configured). */
export function queuedUpstreamRequests(): number {
  return limiter?.queued ?? 0;
}

export function userAgent(): string {
  if (!configured) return `${PRODUCT} (+${REPOSITORY})`;
  const contact = operatorContact ? `; contact: ${operatorContact}` : "";
  return `${PRODUCT} (+${REPOSITORY}; self-hosted${contact})`;
}

/** One incoming request: its upstream fetches are counted, and aborting `signal` cancels them. */
export interface RequestContext {
  upstreamRequests: number;
  readonly signal: AbortSignal;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

export function runInRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContext.run(context, fn);
}

/**
 * Runs one Camptocamp request once a slot is free, passing it the current request's signal to abort its fetch
 * with. Throws UpstreamBusyError past 50 waiters or 20 s of waiting, and the context's abort reason once the
 * context is aborted, whatever `fn` failed with. With neither configureUpstream nor a context it just calls `fn`.
 */
export async function withUpstreamSlot<T>(fn: (signal: AbortSignal | undefined) => Promise<T>): Promise<T> {
  const context = requestContext.getStore();
  if (!limiter && !context) return fn(undefined);
  const slots = limiter; // the limiter this slot is taken from is the one it goes back to
  const signal = context?.signal;
  await slots?.acquire(signal);
  try {
    if (signal?.aborted) throw abortReason(signal);
    if (context) context.upstreamRequests++;
    return await fn(signal);
  } catch (error) {
    if (signal?.aborted) throw abortReason(signal);
    throw error;
  } finally {
    slots?.release();
  }
}

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error("request aborted", { cause: reason });
}
