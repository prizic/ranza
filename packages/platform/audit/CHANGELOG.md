# @ranza/platform-audit

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Added

- `recordWithin(tx, entry)`: the same validation and statement as `record()`,
  joining a transaction the caller already owns. A caller writing several things
  at once needs the record to share their fate — two transactions can
  half-succeed, and both halves are failures an audit trail exists to prevent.

- Append-only audit records in a module-owned `audit` schema, with the writer
  unable to update or delete what it has written.
- `record()` and `historyOf()`, taking an opaque `organizationId` and an
  opaque subject type, so the module never learns what it is recording.
