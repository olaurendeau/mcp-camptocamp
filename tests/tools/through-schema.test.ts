import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import * as api from "../../src/api/camptocamp.js";
import { areaDetailSchema, routeDetailSchema } from "../../src/api/schemas.js";
import { throughSchema } from "./through-schema.js";

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
    ["mockImplementationOnce", (mock) => mock.mockImplementationOnce(async () => fixture)],
    ["mockImplementation", (mock) => mock.mockImplementation(async () => fixture)],
  ])("parses a fixture set with %s through the schema", async (_, setFixture) => {
    const mock = getSummit();
    setFixture(mock);

    await expect(mock(37355)).resolves.toEqual(parsed);
  });

  it("parses a fixture set with withImplementation through the schema", async () => {
    const mock = getSummit();

    await mock.withImplementation(
      async () => fixture,
      async () => {
        await expect(mock(37355)).resolves.toEqual(parsed);
      },
    );
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
