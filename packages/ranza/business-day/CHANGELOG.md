# @ranza/business-day

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Added

- `business_day_closes`, stamped and append-only, with `front_desk.close_day`
  for the shipped owner, manager and front desk roles
  ([ADR 0034](../../../docs/adr/0034-a-business-day-closes-after-its-cutoff.md)).
- `getCloseTheDay()` and `closeDay()`, which publishes and audits
  `business_day.closed`.
