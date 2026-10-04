import { describe, it, expect, expectTypeOf } from "vitest";
import {
  isPresent,
  isVirtualWaypoint,
  formatDateRange,
  pickLocale,
  pickTitle,
  joinList,
  formatHeader,
  formatRouteName,
  formatRouteLine,
  formatAssociatedRouteLine,
  formatWaypointLine,
  formatTitledLine,
  formatAreaLine,
  formatAreasSection,
  formatBookLine,
  formatOutingLine,
  formatRecentOutings,
} from "../../src/tools/format.js";
import type { AreaSearchResult } from "../../src/api/camptocamp.js";

// Mirrors GET /areas?q=valais&limit=10&lang=fr (2026-10-03): fr is not the first locale.
const valaisCanton: AreaSearchResult = {
  document_id: 14384,
  area_type: "admin_limits",
  locales: [
    { lang: "zh", title: "瓦莱州" },
    { lang: "fr", title: "Valais" },
    { lang: "de", title: "Wallis" },
    { lang: "it", title: "Vallese" },
  ],
  available_langs: ["zh", "fr", "de", "it"],
};

const ecrins: AreaSearchResult = {
  document_id: 14403,
  area_type: "range",
  locales: [{ lang: "fr", title: "Écrins" }],
  available_langs: ["fr"],
};

// Mirrors the associated route 53781 of GET /books/209293?lang=fr (2026-10-03), trimmed to three locales.
const areteDesBosses = {
  document_id: 53781,
  locales: [
    { lang: "it", title: "Monte Bianco via Bossesgrat", title_prefix: "Monte Bianco" },
    { lang: "fr", title: "Arête des Bosses", title_prefix: "Mont Blanc" },
    { lang: "en", title: "Arête des Bosses", title_prefix: "Mont Blanc" },
  ],
};

describe("isPresent", () => {
  it("treats null, undefined, an empty string and an empty list as absent", () => {
    for (const value of [null, undefined, "", []]) {
      expect(isPresent(value)).toBe(false);
    }
  });

  it("treats 0, false, a string and a non-empty list as present", () => {
    for (const value of [0, false, "0", "PD", ["hiking"]]) {
      expect(isPresent(value)).toBe(true);
    }
  });

  it("narrows only the true branch: an absent value may still be an empty string or list", () => {
    const text = "" as string | null | undefined;
    if (isPresent(text)) {
      expectTypeOf(text).toExtend<string>();
    } else {
      expectTypeOf(text).toEqualTypeOf<string | null | undefined>();
    }
    const list = [] as string[] | null;
    if (!isPresent(list)) expectTypeOf(list).toEqualTypeOf<string[] | null>();
  });
});

describe("formatDateRange", () => {
  it("joins two different dates with an arrow", () => {
    expect(formatDateRange("2026-06-10", "2026-06-12")).toBe("2026-06-10 → 2026-06-12");
  });

  it("prints a one-day outing once", () => {
    expect(formatDateRange("2026-08-10", "2026-08-10")).toBe("2026-08-10");
  });

  it("prints the end date alone when there is no start date, without inventing one", () => {
    expect(formatDateRange(null, "2026-08-10")).toBe("2026-08-10");
    expect(formatDateRange(undefined, "2026-08-10")).toBe("2026-08-10");
    expect(formatDateRange("", "2026-08-10")).toBe("2026-08-10");
  });

  it("prints the start date alone when there is no end date, without inventing one", () => {
    expect(formatDateRange("2026-08-10", null)).toBe("2026-08-10");
    expect(formatDateRange("2026-08-10", undefined)).toBe("2026-08-10");
    expect(formatDateRange("2026-08-10", "")).toBe("2026-08-10");
  });

  it("returns an empty string without any date", () => {
    expect(formatDateRange(null, null)).toBe("");
    expect(formatDateRange()).toBe("");
  });
});

describe("pickLocale", () => {
  it("returns the fr locale when it is not first", () => {
    expect(pickLocale(valaisCanton.locales)).toEqual({ lang: "fr", title: "Valais" });
  });

  it("falls back to en before it, as the pl=fr search does", () => {
    // Only the detail GET /routes/675555 returns [it, en]; GET /routes?q=Dente del Resegone&pl=fr
    // returns 675555 with a single en locale, so the detail must pick en too.
    const locales = [
      { lang: "it", title: "Via Ferrata Gamma 2" },
      { lang: "en", title: "Via ferrata Gamma 2 - al Dente del Resegone" },
    ];
    expect(pickLocale(locales)).toBe(locales[1]);
  });

  it("falls back to it before de", () => {
    const locales = [
      { lang: "de", title: "Bergamasker Alpen" },
      { lang: "it", title: "Orobie" },
    ];
    expect(pickLocale(locales)).toBe(locales[1]);
  });

  it("falls back along fr, en, it, de, es, ca, eu, sl, zh, whatever the API order", () => {
    const order = ["fr", "en", "it", "de", "es", "ca", "eu", "sl", "zh"];
    for (let i = 0; i < order.length; i++) {
      const locales = [...order.slice(i)].reverse().map((lang) => ({ lang, title: lang }));
      expect(pickLocale(locales)?.lang).toBe(order[i]);
    }
  });

  it("prefers a listed language over an unlisted one", () => {
    const locales = [
      { lang: "xx", title: "Unlisted" },
      { lang: "zh", title: "列出" },
    ];
    expect(pickLocale(locales)).toBe(locales[1]);
  });

  it("falls back to the first locale when no language is listed", () => {
    const locales = [
      { lang: "xx", title: "First" },
      { lang: "yy", title: "Second" },
    ];
    expect(pickLocale(locales)).toBe(locales[0]);
  });

  it("returns undefined for no locales", () => {
    expect(pickLocale([])).toBeUndefined();
  });
});

describe("pickTitle", () => {
  it("returns the fr title", () => {
    expect(pickTitle(valaisCanton.locales)).toBe("Valais");
  });

  it('returns "Untitled" for no locales', () => {
    expect(pickTitle([])).toBe("Untitled");
  });
});

describe("joinList", () => {
  it("returns undefined for null, undefined and an empty list", () => {
    expect(joinList(null)).toBeUndefined();
    expect(joinList(undefined)).toBeUndefined();
    expect(joinList([])).toBeUndefined();
  });

  it("joins values with a comma", () => {
    expect(joinList(["a", "b"])).toBe("a, b");
  });
});

describe("formatHeader", () => {
  it("writes a level-1 heading with the document ID, then the camptocamp.org URL", () => {
    expect(formatHeader("Écrins", 14403, "areas")).toEqual([
      "# Écrins (ID: 14403)",
      "**URL**: https://www.camptocamp.org/areas/14403",
    ]);
  });

  it("accepts only the six document type segments as path (checked by the typecheck)", () => {
    // @ts-expect-error "route" is not a camptocamp.org segment: the link would be dead.
    expect(formatHeader("Écrins", 14403, "route")[1]).toBe("**URL**: https://www.camptocamp.org/route/14403");
  });
});

describe("formatRouteName", () => {
  it("joins the summit name and the route title", () => {
    // Route 54085 of GET /routes/54085 (2026-10-04).
    expect(
      formatRouteName({ lang: "fr", title: "Versant W par le Glacier du Geay", title_prefix: "Mont Pourri" }),
    ).toBe("Mont Pourri : Versant W par le Glacier du Geay");
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["null", null],
    ["missing", undefined],
  ])("writes the title alone when title_prefix is %s", (_label, title_prefix) => {
    expect(formatRouteName({ lang: "fr", title: "Tour du Mont Pourri en 5 jours", title_prefix })).toBe(
      "Tour du Mont Pourri en 5 jours",
    );
  });

  it("trims the summit name and the title", () => {
    expect(formatRouteName({ lang: "fr", title: "  Voie normale ", title_prefix: " Castell Vidre  " })).toBe(
      "Castell Vidre : Voie normale",
    );
    expect(formatRouteName({ lang: "fr", title: " Voie normale  ", title_prefix: "  " })).toBe("Voie normale");
  });

  it('writes "Untitled" without a locale', () => {
    expect(formatRouteName(undefined)).toBe("Untitled");
  });

  it("writes the summit name alone when the title is blank", () => {
    expect(formatRouteName({ lang: "fr", title: "  ", title_prefix: "Mont Pourri" })).toBe("Mont Pourri");
    expect(formatRouteName({ lang: "fr", title: "", title_prefix: " Mont Pourri " })).toBe("Mont Pourri");
  });

  it('writes "Untitled" when both the summit name and the title are blank', () => {
    expect(formatRouteName({ lang: "fr", title: " ", title_prefix: "" })).toBe("Untitled");
  });
});

describe("formatAssociatedRouteLine", () => {
  it("prefixes the fr title with its title_prefix", () => {
    expect(formatAssociatedRouteLine(areteDesBosses)).toBe("- [53781] Mont Blanc : Arête des Bosses");
  });

  it("writes the title alone when title_prefix is empty, null or missing", () => {
    // Route 46381 of GET /books/1925012?lang=fr (2026-10-03) has title_prefix "".
    expect(
      formatAssociatedRouteLine({
        document_id: 46381,
        locales: [{ lang: "fr", title: "Traversée Brévent - Aiguillette des Houches", title_prefix: "" }],
      }),
    ).toBe("- [46381] Traversée Brévent - Aiguillette des Houches");
    expect(
      formatAssociatedRouteLine({ document_id: 1, locales: [{ lang: "fr", title: "T", title_prefix: null }] }),
    ).toBe("- [1] T");
    expect(formatAssociatedRouteLine({ document_id: 2, locales: [{ lang: "fr", title: "T" }] })).toBe("- [2] T");
  });

  it("never writes a dangling separator for a blank title_prefix", () => {
    // Route 1678194 of GET /routes?w=37916 (2026-10-04) has no summit name; "   " stands for a blank one.
    const line = formatAssociatedRouteLine({
      document_id: 1678194,
      locales: [{ lang: "fr", title: "Tour du Mont Pourri en 5 jours", title_prefix: "   " }],
    });
    expect(line).toBe("- [1678194] Tour du Mont Pourri en 5 jours");
    expect(line).not.toContain("] : ");
    expect(line).not.toContain("]  : ");
  });

  it('writes "Untitled" without locales', () => {
    expect(formatAssociatedRouteLine({ document_id: 3, locales: [] })).toBe("- [3] Untitled");
  });

  it("adds the ratings labelled by system", () => {
    // Route 54085 as associated with outing 1880674 in GET /outings/1880674 (2026-10-04).
    expect(
      formatAssociatedRouteLine({
        document_id: 54085,
        locales: [{ lang: "fr", title: "Versant W par le Glacier du Geay", title_prefix: "Mont Pourri" }],
        ski_rating: "4.1",
        ski_exposition: "E2",
        labande_ski_rating: "S4",
        labande_global_rating: "AD",
      }),
    ).toBe(
      "- [54085] Mont Pourri : Versant W par le Glacier du Geay | Ski rating (Toponeige): 4.1 | Ski exposure: E2 | Labande: S4 / AD",
    );
  });
});

describe("formatRouteLine", () => {
  // Routes 430919 and 55195 of GET /routes?q=voie normale&limit=10&pl=fr (2026-10-04), reduced to the typed fields.
  const castellVidre = {
    document_id: 430919,
    locales: [{ lang: "fr", title: "Voie normale", title_prefix: "Castell Vidre" }],
    activities: ["rock_climbing"],
    elevation_max: 1629,
    height_diff_up: 150,
    height_diff_difficulties: 80,
    global_rating: "AD+",
    engagement_rating: "I",
    risk_rating: "X1",
    equipment_rating: "P1",
    rock_free_rating: "5b",
    rock_required_rating: "5b",
    exposition_rock_rating: "E1",
    aid_rating: "A0",
  };
  const rocciaNera = {
    document_id: 55195,
    locales: [{ lang: "fr", title: "Versant SW", title_prefix: "Roccia Nera" }],
    activities: ["skitouring", "snow_ice_mixed"],
    elevation_max: 4075,
    height_diff_up: 650,
    height_diff_difficulties: 650,
    ski_rating: "4.1",
    ski_exposition: "E4",
    global_rating: "F",
    engagement_rating: "II",
  };

  it("writes name, activities, max elevation, elevation gain and every labelled rating", () => {
    expect(formatRouteLine(castellVidre)).toBe(
      "- [430919] Castell Vidre : Voie normale (rock_climbing) | Max elevation: 1629m | Elevation gain: 150m | " +
        "Global rating: AD+ | Engagement: I | Risk rating: X1 | Equipment: P1 | Rock free rating: 5b | " +
        "Rock required rating: 5b | Rock exposure: E1 | Aid rating: A0",
    );
    expect(formatRouteLine(rocciaNera)).toBe(
      "- [55195] Roccia Nera : Versant SW (skitouring, snow_ice_mixed) | Max elevation: 4075m | Elevation gain: 650m | " +
        "Ski rating (Toponeige): 4.1 | Ski exposure: E4 | Global rating: F | Engagement: II",
    );
  });

  it("leaves out missing values and empty activities", () => {
    expect(
      formatRouteLine({ document_id: 10, locales: [{ lang: "en", title: "English Title" }], activities: [] }),
    ).toBe("- [10] English Title");
    expect(
      formatRouteLine({
        document_id: 11,
        locales: [{ lang: "fr", title: "T" }],
        activities: ["hiking"],
        elevation_max: null,
        height_diff_up: null,
        hiking_rating: null,
      }),
    ).toBe("- [11] T (hiking)");
  });
});

describe("formatWaypointLine", () => {
  // Mirrors waypoint 37295 of GET /books/209293?lang=fr (2026-10-03).
  const domes = {
    document_id: 37295,
    locales: [{ lang: "fr", title: "Dômes de Miage - Sommet W" }],
    waypoint_type: "summit",
  };

  it("prints the elevation, including 0", () => {
    expect(formatWaypointLine({ ...domes, elevation: 3670 })).toBe(
      "- [37295] Dômes de Miage - Sommet W (summit) | 3670m",
    );
    expect(formatWaypointLine({ ...domes, elevation: 0 })).toBe("- [37295] Dômes de Miage - Sommet W (summit) | 0m");
  });

  it("prints nothing for a null or missing elevation", () => {
    expect(formatWaypointLine({ ...domes, elevation: null })).toBe("- [37295] Dômes de Miage - Sommet W (summit)");
    expect(formatWaypointLine(domes)).toBe("- [37295] Dômes de Miage - Sommet W (summit)");
  });

  it("marks the main waypoint after the elevation", () => {
    // Waypoint 37916, main_waypoint_id of GET /routes/54085 (2026-10-04).
    const montPourri = {
      document_id: 37916,
      locales: [{ lang: "fr", title: "Mont Pourri" }],
      waypoint_type: "summit",
      elevation: 3779,
    };
    expect(formatWaypointLine(montPourri, { main: true })).toBe(
      "- [37916] Mont Pourri (summit) | 3779m | main waypoint",
    );
    expect(formatWaypointLine(montPourri, { main: false })).toBe("- [37916] Mont Pourri (summit) | 3779m");
    expect(formatWaypointLine({ ...montPourri, elevation: null }, { main: true })).toBe(
      "- [37916] Mont Pourri (summit) | main waypoint",
    );
  });
});

// Waypoint 1947492 as listed in GET /routes/944120?lang=fr (2026-10-04): a virtual waypoint (a grouping of
// routes) with the placeholder elevation 0.
const ouvertures2013 = {
  document_id: 1947492,
  locales: [
    { lang: "en", title: "First Ascents in 2013" },
    { lang: "fr", title: "Ouvertures 2013" },
  ],
  waypoint_type: "virtual",
  elevation: 0,
};

describe("isVirtualWaypoint", () => {
  it("is true only for the virtual waypoint type", () => {
    expect(isVirtualWaypoint(ouvertures2013)).toBe(true);
    expect(isVirtualWaypoint({ ...ouvertures2013, waypoint_type: "access" })).toBe(false);
    expect(isVirtualWaypoint({ ...ouvertures2013, waypoint_type: "summit" })).toBe(false);
  });
});

describe("formatWaypointLine for a virtual waypoint", () => {
  it("prints no elevation, whatever the API sends", () => {
    expect(formatWaypointLine(ouvertures2013)).toBe("- [1947492] Ouvertures 2013 (virtual)");
    // Derived: a non-zero placeholder must not leak either.
    expect(formatWaypointLine({ ...ouvertures2013, elevation: 7999 })).toBe("- [1947492] Ouvertures 2013 (virtual)");
  });

  it("still marks a virtual main waypoint", () => {
    expect(formatWaypointLine({ ...ouvertures2013, elevation: 7999 }, { main: true })).toBe(
      "- [1947492] Ouvertures 2013 (virtual) | main waypoint",
    );
  });
});

describe("formatBookLine", () => {
  // Books 14643 and 472409 of GET /routes/54085 associations (2026-10-04).
  it("prints the title verbatim, the author, the types and the activities", () => {
    expect(
      formatBookLine({
        document_id: 14643,
        locales: [{ lang: "fr", title: "Le topo de la Vanoise -  Tarentaise - Beaufortain", summary: null }],
        author: "James Merel, Philippe Deslandes",
        book_types: ["topo"],
        activities: ["mountain_climbing", "snow_ice_mixed", "rock_climbing"],
      }),
    ).toBe(
      "- [14643] Le topo de la Vanoise -  Tarentaise - Beaufortain | Author: James Merel, Philippe Deslandes | " +
        "Types: topo | Activities: mountain_climbing, snow_ice_mixed, rock_climbing",
    );
  });

  it("leaves out a null author and empty lists", () => {
    expect(
      formatBookLine({
        document_id: 472409,
        locales: [{ lang: "fr", title: "Montagnes Magazine #396" }],
        author: null,
        book_types: ["magazine"],
        activities: [],
      }),
    ).toBe("- [472409] Montagnes Magazine #396 | Types: magazine");
  });
});

// Outing 1900552, first of GET /routes/54085 associations.recent_outings (2026-10-04), reduced to the typed fields.
const outing1900552 = {
  document_id: 1900552,
  locales: [{ lang: "fr", title: "Mont Pourri : Versant W par le Glacier du Geay" }],
  activities: ["skitouring"],
  date_start: "2026-04-26",
  date_end: "2026-04-26",
  condition_rating: "good",
  elevation_max: 3779,
  height_diff_up: 1425,
  ski_rating: "4.1",
  labande_global_rating: "AD",
  areas: [
    { document_id: 14274, locales: [{ lang: "fr", title: "France" }], area_type: "country" },
    { document_id: 14409, locales: [{ lang: "fr", title: "Vanoise" }], area_type: "range" },
  ],
  author: { name: "krok", user_id: 1573563 },
};
const OUTING_1900552_LINE =
  "- [1900552] Mont Pourri : Versant W par le Glacier du Geay (skitouring) | 2026-04-26 | Conditions: good | " +
  "Max elevation: 3779m | Elevation gain: 1425m | Ski rating (Toponeige): 4.1 | Labande: AD | " +
  "Areas: Vanoise [14409] | Author: krok";

describe("formatOutingLine", () => {
  it("writes the search_outings line: dates, conditions, elevations, ratings, ranges and author", () => {
    expect(formatOutingLine(outing1900552)).toBe(OUTING_1900552_LINE);
  });
});

describe("formatRecentOutings", () => {
  const more = "search_outings with route_id=54085";

  it("heads the lines with the shown and total counts and ends with where to find more", () => {
    expect(formatRecentOutings({ documents: [outing1900552], total: 64 }, more)).toEqual([
      "\n## Recent outings (1 of 64)",
      OUTING_1900552_LINE,
      "More: search_outings with route_id=54085",
    ]);
  });

  it("leaves out the More line when every outing is shown", () => {
    expect(formatRecentOutings({ documents: [outing1900552], total: 1 }, more)).toEqual([
      "\n## Recent outings (1 of 1)",
      OUTING_1900552_LINE,
    ]);
  });

  it("returns no section without outings", () => {
    // Route 944120 of GET /routes/944120 (2026-10-04) has recent_outings {documents: [], total: 0}.
    expect(formatRecentOutings({ documents: [], total: 0 }, more)).toEqual([]);
    expect(formatRecentOutings(null, more)).toEqual([]);
    expect(formatRecentOutings(undefined, more)).toEqual([]);
  });
});

describe("formatTitledLine", () => {
  it("writes the ID and the fr title", () => {
    expect(formatTitledLine(valaisCanton)).toBe("- [14384] Valais");
  });

  it('writes "Untitled" without locales', () => {
    expect(formatTitledLine({ document_id: 5, locales: [] })).toBe("- [5] Untitled");
  });
});

describe("formatAreaLine", () => {
  it("writes the ID, the fr title and the area type", () => {
    expect(formatAreaLine(valaisCanton)).toBe("- [14384] Valais (admin_limits)");
  });
});

describe("formatAreasSection", () => {
  it("returns an empty list when areas are missing or empty", () => {
    expect(formatAreasSection(undefined)).toEqual([]);
    expect(formatAreasSection(null)).toEqual([]);
    expect(formatAreasSection([])).toEqual([]);
  });

  it("returns a heading and one line per area in API order", () => {
    expect(formatAreasSection([valaisCanton, ecrins])).toEqual([
      "\n## Areas",
      "- [14384] Valais (admin_limits)",
      "- [14403] Écrins (range)",
    ]);
  });
});
