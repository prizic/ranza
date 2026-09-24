# @ranza/maintenance

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Added

- `maintenance_requests`: a problem reported at a Property, numbered per
  Property, moved on a board, assigned, prioritised and cancelled with a reason.
- `maintenance_unit_holds`: a request holding its Unit out of order, and the
  Unit's status kept in step with the holds through Accommodation's write
  contract (ADR 0032).
- `maintenance_settings`: an Organization default and Property overrides for
  whether work needs an assignee, how a room returns, and what it returns as.
- `unit.returned_to_service`, applied to housekeeping status by
  `app.mark_unit_returned_to_service()` in `apps/worker`.
