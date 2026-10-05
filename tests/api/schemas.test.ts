import { describe, it, expect } from "vitest";
import type { z } from "zod";
import {
  routeDetailSchema,
  routeSearchResponseSchema,
  outingListItemSchema,
  outingDetailSchema,
  outingListResponseSchema,
  articleDetailSchema,
  articleSearchResponseSchema,
  areaSearchResponseSchema,
  bookDetailSchema,
  bookSearchResponseSchema,
  waypointDetailSchema,
  waypointSearchResponseSchema,
  isMalformed,
} from "../../src/api/schemas.js";

// Trimmed real GET /routes/53914: unset values come as null, and the API sends many untyped fields.
const route53914 = {
  document_id: 53914,
  version: 9,
  quality: "medium",
  locales: [
    { lang: "fr", title: "Martine is on the rock", summary: null, topic_id: null, title_prefix: "Aiguille Dibona" },
  ],
  activities: ["rock_climbing"],
  elevation_max: 3131,
  height_diff_down: null,
  risk_rating: null,
  exposition_rock_rating: null,
  aid_rating: null,
  route_types: ["loop_hut"],
  geometry: { version: 12, geom_detail: null },
  areas: [
    {
      document_id: 14403,
      version: 3,
      locales: [{ lang: "fr", title: "Écrins", version: 7 }],
      area_type: "range",
      available_langs: null,
      protected: false,
      type: "a",
    },
  ],
  protected: false,
  type: "r",
};

describe("response schemas", () => {
  it("accept the API's null fields and drop the untyped ones", () => {
    expect(routeDetailSchema.parse(route53914)).toEqual({
      document_id: 53914,
      locales: [{ lang: "fr", title: "Martine is on the rock", summary: null, title_prefix: "Aiguille Dibona" }],
      activities: ["rock_climbing"],
      elevation_max: 3131,
      height_diff_down: null,
      risk_rating: null,
      exposition_rock_rating: null,
      aid_rating: null,
      route_types: ["loop_hut"],
      geometry: { geom_detail: null },
      areas: [
        { document_id: 14403, locales: [{ lang: "fr", title: "Écrins" }], area_type: "range", available_langs: null },
      ],
    });
  });

  it("accept missing optional fields", () => {
    const item = { document_id: 1, locales: [], activities: ["hiking"] };
    expect(outingListItemSchema.parse(item)).toEqual(item);
    expect(bookDetailSchema.parse({ document_id: 2, locales: [], associations: null })).toEqual({
      document_id: 2,
      locales: [],
      associations: null,
    });
  });

  it("keep a well-formed author and drop a malformed one instead of failing the document", () => {
    const item = { document_id: 1, locales: [], activities: ["hiking"] };
    const author = { name: "o.laurendeau", user_id: 430052 };
    expect(outingListItemSchema.parse({ ...item, author: { ...author, forum_username: "x" } }).author).toEqual(author);
    expect(outingListItemSchema.parse({ ...item, author: null }).author).toBeNull();
    expect(outingListItemSchema.parse(item).author).toBeUndefined();

    for (const malformed of [{ name: "o.laurendeau" }, { user_id: 430052 }, { ...author, user_id: "430052" }, "x"]) {
      expect(outingListItemSchema.parse({ ...item, author: malformed })).toEqual({ ...item, author: null });
      expect(articleDetailSchema.parse({ document_id: 2, locales: [], author: malformed }).author).toBeNull();
    }
  });

  // S1 (#118): /outings/{id} has no author; its users are kept as {document_id, name}, their locales have no title.
  it("keep an outing's linked users as document_id and name, and drop any author key", () => {
    const outing = { document_id: 1757161, locales: [], activities: ["snow_ice_mixed"] };
    const user = { version: 2, locales: [{ version: 1, lang: "fr" }], type: "u", forum_username: "MarionO" };
    const parsed = outingDetailSchema.parse({
      ...outing,
      author: { name: "emag", user_id: 944173 },
      associations: {
        users: [
          { ...user, document_id: 466185, name: "MarionO" },
          { ...user, document_id: 944173, name: "emag" },
        ],
      },
    });

    expect(parsed).toEqual({
      ...outing,
      associations: {
        users: [
          { document_id: 466185, name: "MarionO" },
          { document_id: 944173, name: "emag" },
        ],
      },
    });
    expect(outingDetailSchema.parse({ ...outing, associations: { users: null } }).associations?.users).toBeNull();
    expect(outingDetailSchema.parse({ ...outing, associations: {} }).associations?.users).toBeUndefined();
  });

  // S3 of #255: outings 219347, 1924138 and 669600 send true, false and null; older outings may lack the key.
  it("keep an outing's partial_trip flag as sent: true, false, null or missing", () => {
    const outing = { document_id: 219347, locales: [], activities: ["snow_ice_mixed"] };

    for (const flag of [true, false, null]) {
      expect(outingDetailSchema.parse({ ...outing, partial_trip: flag }).partial_trip).toBe(flag);
    }
    expect(outingDetailSchema.parse(outing).partial_trip).toBeUndefined();
    expect(() => outingDetailSchema.parse({ ...outing, partial_trip: "yes" })).toThrow();
  });

  it("reject a response missing a field the formatters dereference", () => {
    expect(routeDetailSchema.safeParse({ ...route53914, activities: undefined }).success).toBe(false);
    expect(routeSearchResponseSchema.safeParse({ documents: [] }).success).toBe(false);
    expect(routeDetailSchema.safeParse({ ...route53914, locales: [{ lang: "fr", title: null }] }).success).toBe(false);
  });
});

// AC4.3 on #153: every list whose items get their own line, at its path in the response.
const route = { document_id: 54085, locales: [], activities: ["skitouring"] };
const waypoint = { document_id: 104151, locales: [], waypoint_type: "hut" };
const outing = { document_id: 1757161, locales: [], activities: ["skitouring"] };
const book = { document_id: 14643, locales: [] };
const article = { document_id: 469577, locales: [] };
const LISTS: Array<[string, z.ZodTypeAny, object, string]> = [
  ...["waypoints", "routes", "books", "articles", "recent_outings.documents"].map(
    (list) => ["route", routeDetailSchema, route, `associations.${list}`] as [string, z.ZodTypeAny, object, string],
  ),
  ["route", routeDetailSchema, route, "areas"],
  ...["all_routes.documents", "books", "recent_outings.documents"].map(
    (list) =>
      ["waypoint", waypointDetailSchema, waypoint, `associations.${list}`] as [string, z.ZodTypeAny, object, string],
  ),
  ["waypoint", waypointDetailSchema, waypoint, "areas"],
  ["outing", outingDetailSchema, outing, "associations.routes"],
  ["outing", outingDetailSchema, outing, "associations.users"],
  ...["routes", "waypoints", "articles"].map(
    (list) => ["book", bookDetailSchema, book, `associations.${list}`] as [string, z.ZodTypeAny, object, string],
  ),
  ...["routes", "waypoints", "articles", "outings", "books"].map(
    (list) =>
      ["article", articleDetailSchema, article, `associations.${list}`] as [string, z.ZodTypeAny, object, string],
  ),
  ["route search", routeSearchResponseSchema, {}, "documents"],
  ["waypoint search", waypointSearchResponseSchema, {}, "documents"],
  ["outing search", outingListResponseSchema, {}, "documents"],
  ["area search", areaSearchResponseSchema, {}, "documents"],
  ["book search", bookSearchResponseSchema, {}, "documents"],
  ["article search", articleSearchResponseSchema, {}, "documents"],
];

// The document `base` with `value` at `path`; a `documents` list comes with its total, as the API sends it.
function withList(base: object, path: string, value: unknown): object {
  const nest = ([key, ...rest]: string[]): object =>
    rest.length > 0 ? { [key]: nest(rest) } : { [key]: value, ...(key === "documents" && { total: 64 }) };
  return { ...base, ...nest(path.split(".")) };
}

function valueAt(parsed: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], parsed);
}

describe("lists of a response (#129)", () => {
  // Every item schema requires a locale title, so the first item is malformed in every list; its ID is readable.
  const items = [{ document_id: 104151, locales: [{ lang: "fr", title: null }] }, { document_id: "104151" }, null];

  it.each(LISTS)("%s %s: a malformed item becomes a placeholder, keeping a readable ID", (_, schema, base, path) => {
    const parsed: unknown = schema.parse(withList(base, path, items));

    expect(valueAt(parsed, path)).toEqual([
      { malformed: true, document_id: 104151 },
      { malformed: true },
      { malformed: true },
    ]);
    if (path.endsWith("documents")) expect(valueAt(parsed, path.replace(/documents$/, "total"))).toBe(64);
  });

  it.each(LISTS)("%s %s: a list that is not an array still fails the response", (_, schema, base, path) => {
    const result = schema.safeParse(withList(base, path, { 0: items[0] }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path.join(".")).toBe(path);
  });

  it("keeps a top-level field strict: a document without its document_id still fails", () => {
    const noId = { ...route, document_id: undefined };

    expect(routeDetailSchema.safeParse(withList(noId, "associations.waypoints", items)).success).toBe(false);
  });

  it("only reads a positive integer document_id", () => {
    const parsed = routeSearchResponseSchema.parse({
      documents: [{ document_id: 1.5 }, { document_id: -3 }, { document_id: Number.MAX_SAFE_INTEGER + 2 }, [], 7],
      total: 5,
    });

    expect(parsed.documents).toEqual(Array.from({ length: 5 }, () => ({ malformed: true })));
  });

  it("parses a well-formed item as before, never as malformed", () => {
    const item = { document_id: 37916, locales: [{ lang: "fr", title: "Mont Pourri" }], waypoint_type: "summit" };
    const parsed = waypointSearchResponseSchema.parse({ documents: [{ ...item, malformed: true }], total: 1 });

    expect(parsed.documents).toEqual([item]);
    expect(parsed.documents.map(isMalformed)).toEqual([false]);
  });
});
