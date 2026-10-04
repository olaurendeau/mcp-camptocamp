// Rating labels (rule R4 of #58): every rating is printed with the name of its grading system, never as a bare
// "Rating". One table serves every route and outing, in search lines and in details.
import type { RatingFields } from "../api/schemas.js";

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
