import { vi, type Mock } from "vitest";
import type { z } from "zod";

type ApiFunction = (...args: never[]) => Promise<unknown>;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | undefined)?.then === "function";

/** True only when A and B are the same type: mutual assignability would let optional fields differ. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- G only probes how A and B relate
type Equals<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

/** The schema whose output is exactly what the mocked function resolves to: any other schema does not compile. */
type SchemaOf<T extends ApiFunction, S extends z.ZodTypeAny> =
  Equals<z.output<S>, Awaited<ReturnType<T>>> extends true
    ? S
    : { "schema output must be the mocked function's resolved type": Awaited<ReturnType<T>> };

// Every mock method that sets what the mock returns: redirected to the fixture mock.
export const FIXTURE_SETTERS = [
  "mockImplementation",
  "mockImplementationOnce",
  "withImplementation",
  "mockReturnThis",
  "mockReturnValue",
  "mockReturnValueOnce",
  "mockResolvedValue",
  "mockResolvedValueOnce",
  "mockRejectedValue",
  "mockRejectedValueOnce",
  "mockThrow",
  "mockThrowOnce",
] as const;

// The mock methods that drop the implementation: replaced so that the parsing comes back after them.
export const RESETTERS = ["mockReset", "mockRestore"] as const;

// The mock methods left as they are: they only clear the recorded calls or name the mock, and
// Symbol.dispose (a `using` block) calls mockRestore, which is replaced.
export const NOT_REDIRECTED: readonly (string | symbol)[] = ["mockClear", "mockName", Symbol.dispose];

/**
 * Makes the mocked API function parse whatever it resolves through `schema`, as getJson does at
 * runtime: a fixture field the schema does not declare never reaches the handler, and a fixture the
 * schema rejects fails the test.
 *
 * The mocked function's own implementation is fixed to "call the fixture mock, parse its result";
 * every fixture setter (`mockResolvedValue[Once]`, `mockImplementation[Once]`,
 * `mockReturnValue[Once]`, `mockThrow[Once]`, `withImplementation`…) is redirected to the fixture
 * mock, and `mockReset`/`mockRestore` (also called by `vi.resetAllMocks` and by disposing of the mock)
 * keep the parsing. So no way of setting a fixture skips the schema; a guard test fails when vitest
 * adds a `mock*`/`with*` or Symbol-keyed method that none of the lists above handles. `schema` must
 * output exactly the mocked function's resolved type.
 *
 * The replacement `mockRestore` skips vitest's own restore step: a `vi.spyOn` spy passed here would
 * not get its original method back. Pass only `vi.fn()` or `vi.mock` module mocks.
 */
export function throughSchema<T extends ApiFunction, S extends z.ZodTypeAny>(
  mocked: Mock<T>,
  schema: SchemaOf<T, S>,
): Mock<T> {
  const fixture = vi.fn<T>();
  const setImplementation = mocked.mockImplementation.bind(mocked);
  const reset = mocked.mockReset.bind(mocked);
  const parse = async function (this: unknown, ...args: Parameters<T>) {
    return (schema as S).parse(await fixture.apply(this, args)) as unknown;
  } as unknown as Parameters<typeof setImplementation>[0];

  const toMocked = (result: unknown) => (result === fixture ? mocked : result);

  const methods = mocked as unknown as Record<string, (...args: unknown[]) => unknown>;
  const fixtureMethods = fixture as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const setter of FIXTURE_SETTERS) {
    methods[setter] = (...args) => {
      const result = fixtureMethods[setter].apply(fixture, args);
      // An async withImplementation returns a promise of the mock it was called on.
      return isThenable(result) ? result.then(toMocked) : toMocked(result);
    };
  }
  for (const resetter of RESETTERS) {
    methods[resetter] = () => {
      reset();
      fixture.mockReset();
      setImplementation(parse);
      return mocked;
    };
  }

  setImplementation(parse);
  return mocked;
}
