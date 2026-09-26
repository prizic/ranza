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
  `business_day.closed`, the record filed at the Property
  ([ADR 0031](../../../docs/adr/0031-an-audit-record-carries-its-location-and-is-read-by-permission.md)).
- `createDayCloser()`, the worker's half: one pass asks which days are due
  through `app.properties_due_for_close()` and closes each quiet one through
  `app.close_business_day_automatically()`, one transaction per Property, and
  reports every failure with its Property rather than stopping.
