# @ranza/guests

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Added

- The `guests` table: a person, owned by an Organization rather than by a
  Property ([ADR 0024](../../../docs/adr/0024-a-guest-belongs-to-an-organization-and-a-reservation-holds-its-nights.md)).
- `app.can_use_capability_in_organization()`, which asks blueprint 3.5's four
  gates of an Organization-scoped write by asking them of any one Property the
  acting Staff Member reaches.
- `identifyGuestWithin()` and `GUEST_DETAILS`: the Guest a set of details names,
  created when the Organization has nobody at that exact email.
