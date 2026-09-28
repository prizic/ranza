# @ranza/rates

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Added

- `property_rates`, a nightly price per Property and unit type, stamped in the
  Property's currency, with `rates.manage` for the shipped owner and manager
  roles ([ADR 0038](../../../docs/adr/0038-a-night-is-priced-by-its-unit-type-and-fixed-when-booked.md)).
- `getPriceList()` and `setPrices()`, which audits `price_list.changed`.
