# @ranza/reservations

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Added

- The `reservations` table: a planned allocation of an Accommodation Unit for a
  period, with the same composite foreign keys as every other Property-scoped
  row, and the lifecycle `requested → confirmed → cancelled | no_show |
checked_in`.
- The product's first write policies. `INSERT` and `UPDATE` on `reservations`
  and `INSERT` on `stays` are bounded by a `WITH CHECK` carrying all four of
  blueprint 3.5's gates, because a write has no surrounding query to carry them
  ([ADR 0012](../../../docs/adr/0012-a-write-is-bounded-by-a-policy-not-a-check.md)).
- `stays_no_double_booking`, an exclusion constraint over `btree_gist` and a
  half-open `daterange`. Two current Stays on one Accommodation Unit over
  overlapping nights are now unrepresentable rather than checked.
- `stays.reservation_id`, unique, so a Reservation produces at most one Stay.
- `listArrivals()`, `checkIn()` and `FRONT_DESK_CAPABILITY`.

No availability search, no group reservations, no quotations, deposits,
extensions, room moves or check-out. `no_show` is a status value nothing sets
yet.
