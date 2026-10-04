// Rating labels (rule R4 of #58): every rating is printed with the name of its grading system, never as a bare
// "Rating". One table serves every route and outing, in search lines and in details.
import type { RatingFields } from "../api/schemas.js";
import type { RouteRatingField } from "../api/values.js";

type RatingField = keyof RatingFields;

interface RatingDisplay {
  label: string;
  // Labande has two halves, printed together as "<ski> / <global>".
  fields: readonly [RatingField] | readonly [RatingField, RatingField];
}

// Order: decision Q1 on #58 (Camptocamp's own field order, Labande before Global rating).
export const RATING_DISPLAY: readonly RatingDisplay[] = [
  { label: "Ski rating (Toponeige)", fields: ["ski_rating"] },
  { label: "Ski exposure", fields: ["ski_exposition"] },
  { label: "Labande", fields: ["labande_ski_rating", "labande_global_rating"] },
  { label: "Global rating", fields: ["global_rating"] },
  { label: "Engagement", fields: ["engagement_rating"] },
  { label: "Risk rating", fields: ["risk_rating"] },
  { label: "Equipment", fields: ["equipment_rating"] },
  { label: "Rock free rating", fields: ["rock_free_rating"] },
  { label: "Rock required rating", fields: ["rock_required_rating"] },
  { label: "Rock exposure", fields: ["exposition_rock_rating"] },
  { label: "Aid rating", fields: ["aid_rating"] },
  { label: "Ice rating", fields: ["ice_rating"] },
  { label: "Mixed rating", fields: ["mixed_rating"] },
  { label: "Via ferrata rating", fields: ["via_ferrata_rating"] },
  { label: "Hiking rating", fields: ["hiking_rating"] },
  { label: "Hiking/MTB exposure", fields: ["hiking_mtb_exposition"] },
  { label: "Snowshoe rating", fields: ["snowshoe_rating"] },
  { label: "MTB up rating", fields: ["mtb_up_rating"] },
  { label: "MTB down rating", fields: ["mtb_down_rating"] },
];

// [label, value] for each rating the document has; null, missing and "" are absent.
function presentRatings(document: RatingFields): [string, string][] {
  const ratings: [string, string][] = [];
  for (const { label, fields } of RATING_DISPLAY) {
    const values = fields.map((field) => document[field]).filter((value): value is string => !!value);
    if (values.length > 0) ratings.push([label, values.join(" / ")]);
  }
  return ratings;
}

// Fragments of a one-line summary: "Ski rating (Toponeige): 4.1".
export function formatRatingParts(document: RatingFields): string[] {
  return presentRatings(document).map(([label, value]) => `${label}: ${value}`);
}

// Lines of a detail: "**Ski rating (Toponeige)**: 4.1".
export function formatRatingLines(document: RatingFields): string[] {
  return presentRatings(document).map(([label, value]) => `**${label}**: ${value}`);
}

// Scales verbatim from c2corg v6_common attributes.py, easiest first, written space-separated; the
// field → scale mapping is v6_api's models/route.py. Several systems share one scale.
const scale = (values: string): readonly string[] => values.split(" ");
const GLOBAL = scale("F F+ PD- PD PD+ AD- AD AD+ D- D D+ TD- TD TD+ ED- ED ED+ ED4 ED5 ED6 ED7");
const EXPOSITION = scale("E1 E2 E3 E4");
const CLIMBING = scale(
  "2 3a 3b 3c 4a 4b 4c 5a 5a+ 5b 5b+ 5c 5c+ 6a 6a+ 6b 6b+ 6c 6c+ 7a 7a+ 7b 7b+ 7c 7c+ " +
    "8a 8a+ 8b 8b+ 8c 8c+ 9a 9a+ 9b 9b+ 9c 9c+",
);

export interface RouteRatingSystem {
  /** Name in the Filters line of search_routes, e.g. "ski rating (Toponeige) 3.1 → 4.1". */
  label: string;
  /** Every valid value, easiest first. */
  scale: readonly string[];
}

/** The rating systems search_routes can filter on (Labande counts as two), with their scales. */
export const ROUTE_RATING_SYSTEMS: Record<RouteRatingField, RouteRatingSystem> = {
  ski_rating: {
    label: "ski rating (Toponeige)",
    scale: scale("1.1 1.2 1.3 2.1 2.2 2.3 3.1 3.2 3.3 4.1 4.2 4.3 5.1 5.2 5.3 5.4 5.5 5.6"),
  },
  ski_exposition: { label: "ski exposure", scale: EXPOSITION },
  labande_ski_rating: { label: "Labande ski rating", scale: scale("S1 S2 S3 S4 S5 S6 S7") },
  labande_global_rating: { label: "Labande global rating", scale: GLOBAL },
  global_rating: { label: "global rating", scale: GLOBAL },
  engagement_rating: { label: "engagement", scale: scale("I II III IV V VI") },
  risk_rating: { label: "risk rating", scale: scale("X1 X2 X3 X4 X5") },
  equipment_rating: { label: "equipment", scale: scale("P1 P1+ P2 P2+ P3 P3+ P4 P4+") },
  rock_free_rating: { label: "rock free rating", scale: CLIMBING },
  rock_required_rating: { label: "rock required rating", scale: CLIMBING },
  exposition_rock_rating: { label: "rock exposure", scale: scale("E1 E2 E3 E4 E5 E6") },
  aid_rating: { label: "aid rating", scale: scale("A0 A0+ A1 A1+ A2 A2+ A3 A3+ A4 A4+ A5 A5+") },
  ice_rating: { label: "ice rating", scale: scale("1 2 3 3+ 4 4+ 5 5+ 6 6+ 7 7+") },
  mixed_rating: {
    label: "mixed rating",
    scale: scale("M1 M2 M3 M3+ M4 M4+ M5 M5+ M6 M6+ M7 M7+ M8 M8+ M9 M9+ M10 M10+ M11 M11+ M12 M12+"),
  },
  via_ferrata_rating: { label: "via ferrata rating", scale: scale("K1 K2 K3 K4 K5 K6") },
  hiking_rating: { label: "hiking rating", scale: scale("T1 T2 T3 T4 T5") },
  hiking_mtb_exposition: { label: "hiking/MTB exposure", scale: EXPOSITION },
  snowshoe_rating: { label: "snowshoe rating", scale: scale("R1 R2 R3 R4 R5") },
  mtb_up_rating: { label: "MTB up rating", scale: scale("M1 M2 M3 M4 M5") },
  mtb_down_rating: { label: "MTB down rating", scale: scale("V1 V2 V3 V4 V5") },
};
