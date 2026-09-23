# @ranza/housekeeping

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Added

- The `housekeeping_unit_status` table, one row per status holder, with a
  departure marking the room dirty through `app.mark_unit_dirty_after_check_out()`.
- `board`: every room at a Property with its status and readiness.
- `markUnits`: marking one room or many, audited per room.
