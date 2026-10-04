// The bare label "Rating" (rule R4 of #58) must not appear, neither in a search line (" | Rating: PD") nor in a
// detail ("**Rating**: PD"); system labels such as "Global rating: F" or "**Global rating**: F" may.
export const BARE_RATING = /\bRating(\*\*)?: /;
