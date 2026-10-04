import { describe, it, expect } from "vitest";
import {
  routeDetailSchema,
  routeSearchResponseSchema,
  outingListItemSchema,
  outingDetailSchema,
  articleDetailSchema,
  bookDetailSchema,
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
      expect(outingDetailSchema.parse({ ...item, author: malformed }).author).toBeNull();
      expect(articleDetailSchema.parse({ document_id: 2, locales: [], author: malformed }).author).toBeNull();
    }
  });

  it("reject a response missing a field the formatters dereference", () => {
    expect(routeDetailSchema.safeParse({ ...route53914, activities: undefined }).success).toBe(false);
    expect(routeSearchResponseSchema.safeParse({ documents: [] }).success).toBe(false);
    expect(routeDetailSchema.safeParse({ ...route53914, locales: [{ lang: "fr", title: null }] }).success).toBe(false);
  });
});
