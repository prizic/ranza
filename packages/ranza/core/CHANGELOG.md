# @ranza/core

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Changed

- `properties` gained `currency`, ISO 4217, defaulting to `TRY`. It sits beside
  `timezone` for the same reason that does: an Organization may hold Properties
  in more than one country, so neither fact can live one level up. Owned by
  [`@ranza/folios`](../folios/README.md), which is what copies it onto a Folio
  — this module still owns the table
  ([ADR 0015](../../../docs/adr/0015-money-is-an-integer-a-balance-is-a-sum-and-a-correction-is-a-line.md)).

### Added

- `listEntitledProperties()`: the Properties a Staff Member may use a
  capability in, answered by one statement so all five gates of blueprint 3.5
  apply to it at once.
- `TODAY_CAPABILITY` and the `platform_core` Entitlement key.
