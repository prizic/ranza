# @ranza/stays

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Added

- The `stays` table: a Guest or Resident, an Accommodation Unit, and a period.
- The Resident access path — `stays_read_own` and
  `app.resident_can_use_capability()`, a second way into the same tables that
  is not a widening of the Staff policies ([ADR 0009](../../../docs/adr/0009-a-resident-reaches-their-own-stay-not-an-organization.md)).
- `listOwnStays()` and `PORTAL_STAY_CAPABILITY`.

### Changed

- `stays` gained `reservation_id` and `stays_no_double_booking`, an exclusion
  constraint making two current Stays on one Accommodation Unit over overlapping
  nights unrepresentable. Both are owned by
  [`@ranza/reservations`](../reservations/README.md), which is what creates a
  Stay — this module still owns the table and the Resident access path.
- `ranza_app` may now `INSERT` a Stay, bounded by `stays_insert_front_desk`
  ([ADR 0012](../../../docs/adr/0012-a-write-is-bounded-by-a-policy-not-a-check.md)).
  It still holds no `UPDATE` or `DELETE`: check-out is not built.
