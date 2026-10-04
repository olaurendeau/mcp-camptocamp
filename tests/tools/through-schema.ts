import type { MockedFunction } from "vitest";
import type { z } from "zod";

/**
 * Makes the mocked API function resolve each `mockResolvedValueOnce` fixture through `schema`, as
 * getJson does at runtime: a fixture field the schema does not declare never reaches the handler,
 * and a fixture the schema rejects fails the test.
 */
export function throughSchema<T extends (...args: never[]) => Promise<unknown>>(
  mock: MockedFunction<T>,
  schema: z.ZodTypeAny,
): MockedFunction<T> {
  const resolveOnce = mock.mockResolvedValueOnce.bind(mock);
  mock.mockResolvedValueOnce = (value) => resolveOnce(schema.parse(value));
  return mock;
}
