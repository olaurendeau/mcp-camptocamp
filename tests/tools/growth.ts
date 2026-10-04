// Timing checks for adversarial inputs (#180) that hold on a slow or busy machine: instead of an
// absolute bound in milliseconds, they compare the time taken on an input with the time taken on an
// input built the same way but GROWTH times longer, both measured in the same process. A linear scan
// takes about GROWTH times as long; catastrophic backtracking at least GROWTH² times (quadratic).

const GROWTH = 4;
// Halfway, on a log scale, between linear (4) and quadratic (16) growth.
export const MAX_GROWTH_RATIO = 8;
// The smaller input is lengthened until it takes this long, so that timer resolution and per-call
// overhead do not distort the ratio.
const MIN_SMALL_MS = 5;
const MAX_DOUBLINGS = 8;
const MIN_RUNS = 3;
const MAX_RUNS = 10;

// CPU time of this process, in milliseconds: unlike the wall clock, it does not count the time the
// process waits while other processes (other test files, other CI jobs) run.
function time(run: () => void): number {
  const start = process.cpuUsage();
  run();
  const { user, system } = process.cpuUsage(start);
  return (user + system) / 1000;
}

/**
 * How many times longer `run` takes on `build(GROWTH * n)` than on `build(n)`, `n` being doubled from
 * `count` until `build(n)` takes MIN_SMALL_MS. Both inputs are run in turn, MIN_RUNS times and then
 * up to MAX_RUNS times until the ratio of their fastest runs is under MAX_GROWTH_RATIO: noise only ever
 * slows a run down, so a linear scan gets under it after a few runs, a quadratic one never.
 */
export function growthRatio(run: (text: string) => unknown, build: (count: number) => string, count: number): number {
  let n = count;
  let small = build(n);
  run(small); // warm-up: the first call also compiles the code and the regular expressions
  while (time(() => run(small)) < MIN_SMALL_MS && n < count * 2 ** MAX_DOUBLINGS) {
    n *= 2;
    small = build(n);
  }
  const large = build(GROWTH * n);

  let smallMs = Infinity;
  let largeMs = Infinity;
  // Should the last doubling still be too fast to time, a run of the smaller input counts as 1 ms.
  for (let i = 0; i < MAX_RUNS && (i < MIN_RUNS || largeMs >= MAX_GROWTH_RATIO * smallMs); i++) {
    const smallRun = time(() => run(small));
    const largeRun = time(() => run(large));
    smallMs = Math.min(smallMs, Math.max(smallRun, 1));
    largeMs = Math.min(largeMs, largeRun);
  }
  return largeMs / smallMs;
}
