# @ranza/accommodation

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Added

- The `accommodation_units` table: unit type, capacity and operational status,
  with a composite foreign key making a Unit in another Organization's Property
  unrepresentable.
- `AccommodationUnitType`, mirroring the check constraint the module owns.

No query yet — nothing reads a Unit except through a Stay.
