// Camptocamp's closed lists of values, verbatim from c2corg v6_common attributes.py.

// A hut's custodianship, with its meaning. Used in get_waypoint's description only: the value itself is
// printed verbatim, so a value Camptocamp adds later still shows.
export const CUSTODIANSHIPS = {
  accessible_when_wardened: "open only when the warden is there",
  always_accessible: "a room is open all year, wardened or not",
  key_needed: "a key must be fetched beforehand",
  no_warden: "never wardened",
} as const;
