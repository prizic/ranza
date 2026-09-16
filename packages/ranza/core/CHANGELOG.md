# @ranza/core

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Added

- `listEntitledProperties()`: the Properties a Staff Member may use a
  capability in, answered by one statement so all five gates of blueprint 3.5
  apply to it at once.
- `TODAY_CAPABILITY` and the `platform_core` Entitlement key.
