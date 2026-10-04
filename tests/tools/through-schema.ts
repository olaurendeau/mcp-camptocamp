import { vi, type Mock } from "vitest";
import type { z } from "zod";

type ApiFunction = (...args: never[]) => Promise<unknown>;

/** True only when A and B are the same type: mutual assignability would let optional fields differ. */
type Equals<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

/** The schema whose output is exactly what the mocked function resolves to: any other schema does not compile. */
type SchemaOf<T extends ApiFunction, S extends z.ZodTypeAny> =
  Equals<z.output<S>, Awaited<ReturnType<T>>> extends true
    ? S
    : { "schema output must be the mocked function's resolved type": Awaited<ReturnType<T>> };

// Every mock method that sets what the mock returns.
const FIXTURE_SETTERS = [
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
] as const;

/**
 * Makes the mocked API function parse whatever it resolves through `schema`, as getJson does at
 * runtime: a fixture field the schema does not declare never reaches the handler, and a fixture the
 * schema rejects fails the test.
 *
 * The mocked function's own implementation is fixed to "call the fixture mock, parse its result";
 * every fixture setter (`mockResolvedValue[Once]`, `mockImplementation[Once]`,
 * `mockReturnValue[Once]`, `withImplementation`…) is redirected to the fixture mock, and
 * `mockReset`/`mockRestore` (`vi.resetAllMocks`, `vi.restoreAllMocks`) keep the parsing. So no way of
 * setting a fixture skips the schema. `schema` must output exactly the mocked function's resolved type.
 */
export function throughSchema<T extends ApiFunction, S extends z.ZodTypeAny>(
  mocked: Mock<T>,
  schema: SchemaOf<T, S>,
): Mock<T> {
  const fixture = vi.fn<T>();
  const setImplementation = mocked.mockImplementation.bind(mocked);
  const reset = mocked.mockReset.bind(mocked);
  const parse = async function (this: unknown, ...args: Parameters<T>) {
    return (schema as S).parse(await fixture.apply(this, args));
  } as unknown as Parameters<typeof setImplementation>[0];

  const methods = mocked as unknown as Record<string, (...args: unknown[]) => unknown>;
  const fixtureMethods = fixture as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const setter of FIXTURE_SETTERS) {
    methods[setter] = (...args) => {
      const result = fixtureMethods[setter].apply(fixture, args);
      return result === fixture ? mocked : result;
    };
  }
  methods.mockReset = methods.mockRestore = () => {
    reset();
    fixture.mockReset();
    setImplementation(parse);
    return mocked;
  };

  setImplementation(parse);
  return mocked;
}
