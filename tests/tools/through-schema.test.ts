import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import * as api from "../../src/api/camptocamp.js";
import { areaDetailSchema, routeDetailSchema } from "../../src/api/schemas.js";
import { FIXTURE_SETTERS, NOT_REDIRECTED, RESETTERS, throughSchema } from "./through-schema.js";

vi.mock("../../src/api/camptocamp.js");

const summitSchema = z.object({ document_id: z.number(), elevation: z.number().nullish() });
type Summit = z.infer<typeof summitSchema>;
type GetSummit = (id: number) => Promise<Summit>;
type SummitMock = ReturnType<typeof vi.fn<GetSummit>>;

// A fixture as the API sends it, with a field the schema does not declare: getJson strips it.
const fixture = { document_id: 37355, elevation: 4102, undeclared: "stripped by the schema" };
const parsed = { document_id: 37355, elevation: 4102 };

function getSummit(): SummitMock {
  return throughSchema(vi.fn<GetSummit>(), summitSchema);
}

describe("throughSchema", () => {
  it.each<[string, (mock: SummitMock) => unknown]>([
    ["mockResolvedValueOnce", (mock) => mock.mockResolvedValueOnce(fixture)],
    ["mockResolvedValue", (mock) => mock.mockResolvedValue(fixture)],
    ["mockReturnValueOnce", (mock) => mock.mockReturnValueOnce(Promise.resolve(fixture))],
    ["mockReturnValue", (mock) => mock.mockReturnValue(Promise.resolve(fixture))],
    ["mockImplementationOnce", (mock) => mock.mockImplementationOnce(() => Promise.resolve(fixture))],
    ["mockImplementation", (mock) => mock.mockImplementation(() => Promise.resolve(fixture))],
  ])("parses a fixture set with %s through the schema", async (_, setFixture) => {
    const mock = getSummit();
    setFixture(mock);

    await expect(mock(37355)).resolves.toEqual(parsed);
  });

  it("parses a fixture set with withImplementation through the schema", async () => {
    const mock = getSummit();

    await mock.withImplementation(
      () => Promise.resolve(fixture),
      async () => {
        await expect(mock(37355)).resolves.toEqual(parsed);
      },
    );
  });

  it("resolves an async withImplementation to the mock, as vitest does", async () => {
    const mock = getSummit();

    const result = mock.withImplementation(
      () => Promise.resolve(fixture),
      async () => {
        await expect(mock(37355)).resolves.toEqual(parsed);
      },
    );

    await expect(result).resolves.toBe(mock);
  });

  it("returns the mock from a sync withImplementation, as vitest does", () => {
    const mock = getSummit();

    expect(
      mock.withImplementation(
        () => Promise.resolve(fixture),
        () => undefined,
      ),
    ).toBe(mock);
  });

  it.each(["mockThrow", "mockThrowOnce"] as const)("rejects with the error set by %s", async (setter) => {
    const mock = getSummit();
    mock[setter](new Error("Camptocamp API error: 500"));

    await expect(mock(37355)).rejects.toThrow("Camptocamp API error: 500");
    mock.mockResolvedValueOnce(fixture);
    await expect(mock(37355)).resolves.toEqual(parsed);
  });

  it("parses a mockReturnThis fixture through the schema", async () => {
    const mock = getSummit();
    mock.mockReturnThis();

    await expect(mock.call(fixture, 37355)).resolves.toEqual(parsed);
  });

  it("returns the mock from the setters, so they chain", async () => {
    const mock = getSummit();
    mock.mockResolvedValueOnce(fixture).mockResolvedValueOnce({ ...fixture, elevation: null });

    await expect(mock(37355)).resolves.toEqual(parsed);
    await expect(mock(37355)).resolves.toEqual({ ...parsed, elevation: null });
  });

  it("fails on a fixture the schema rejects", async () => {
    const mock = getSummit();
    mock.mockResolvedValue({ document_id: "37355" } as unknown as Summit);

    await expect(mock(37355)).rejects.toThrow(z.ZodError);
  });

  it("passes a rejection through unchanged", async () => {
    const mock = getSummit();
    mock.mockRejectedValue(new Error("Camptocamp API error: 404"));

    await expect(mock(37355)).rejects.toThrow("Camptocamp API error: 404");
  });

  it("records the handler's calls", async () => {
    const mock = getSummit();
    mock.mockResolvedValueOnce(fixture);

    await mock(37355);

    expect(mock).toHaveBeenCalledOnce();
    expect(mock).toHaveBeenCalledWith(37355);
  });

  it.each(["mockReset", "mockRestore"] as const)("keeps parsing after %s", async (reset) => {
    const mock = getSummit();
    mock.mockResolvedValue(fixture);
    await mock(37355);

    mock[reset]();

    expect(mock).not.toHaveBeenCalled();
    await expect(mock(37355)).rejects.toThrow(z.ZodError);
    mock.mockResolvedValueOnce(fixture);
    await expect(mock(37355)).resolves.toEqual(parsed);
  });

  it("keeps parsing after vi.resetAllMocks, which drops the fixture", async () => {
    const mock = getSummit();
    mock.mockResolvedValue(fixture);

    vi.resetAllMocks();

    await expect(mock(37355)).rejects.toThrow(z.ZodError);
    mock.mockResolvedValueOnce(fixture);
    await expect(mock(37355)).resolves.toEqual(parsed);
  });

  // Since vitest 3, vi.restoreAllMocks only puts back vi.spyOn spies: a vi.fn() mock keeps its fixture.
  it("keeps the fixture and the parsing after vi.restoreAllMocks", async () => {
    const mock = getSummit();
    mock.mockResolvedValue(fixture);

    vi.restoreAllMocks();

    await expect(mock(37355)).resolves.toEqual(parsed);
  });

  it("keeps parsing after a `using` block disposes of the mock", async () => {
    const mock = getSummit();
    mock.mockResolvedValue(fixture);

    mock[Symbol.dispose]();

    await expect(mock(37355)).rejects.toThrow(z.ZodError);
    mock.mockResolvedValueOnce(fixture);
    await expect(mock(37355)).resolves.toEqual(parsed);
  });

  // A vitest upgrade that adds a way of setting what a mock returns must not open a way around the schema.
  it("handles every mock*/with* and Symbol-keyed method of vi.fn(), redirected or explicitly not", () => {
    const methods = (mock: object) => mock as Record<PropertyKey, unknown>;
    const fresh = vi.fn<GetSummit>();
    const keys = Reflect.ownKeys(fresh).filter((key) =>
      typeof key === "symbol" ? typeof methods(fresh)[key] === "function" : /^(mock|with)[A-Z]/.test(key),
    );
    const originals = new Map(keys.map((key) => [key, methods(fresh)[key]]));

    throughSchema(fresh, summitSchema);

    const replaced: readonly (string | symbol)[] = [...FIXTURE_SETTERS, ...RESETTERS];
    expect(keys).toContain(Symbol.dispose);
    expect(new Set([...replaced, ...NOT_REDIRECTED])).toEqual(new Set(keys));
    for (const key of replaced) expect(methods(fresh)[key], String(key)).not.toBe(originals.get(key));
    for (const key of NOT_REDIRECTED) expect(methods(fresh)[key], String(key)).toBe(originals.get(key));
  });

  it("wires a function of the mocked API module", async () => {
    const mockGetArea = throughSchema(vi.mocked(api.getArea), areaDetailSchema);
    mockGetArea.mockResolvedValue({ document_id: 14067, area_type: "range", locales: [], extra: 1 } as never);

    await expect(api.getArea(14067)).resolves.toEqual({ document_id: 14067, area_type: "range", locales: [] });
  });

  it("only compiles with a schema whose output is the mocked function's resolved type", () => {
    // @ts-expect-error -- another endpoint's schema
    throughSchema(vi.mocked(api.getBook), routeDetailSchema);
    // @ts-expect-error -- a schema missing a field of the resolved type
    throughSchema(vi.fn<GetSummit>(), summitSchema.omit({ elevation: true }));
    // @ts-expect-error -- a schema declaring a field the resolved type lacks
    throughSchema(vi.fn<GetSummit>(), summitSchema.extend({ name: z.string().nullish() }));
    // @ts-expect-error -- a schema of anything
    throughSchema(vi.fn<GetSummit>(), z.unknown());
  });
});
