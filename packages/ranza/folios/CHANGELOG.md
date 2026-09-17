# @ranza/folios

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Changed

- The Guest's name on a Folio comes from `public.guests` rather than from
  `reservations.guest_name`, which is gone
  ([ADR 0024](../../../docs/adr/0024-a-guest-belongs-to-an-organization-and-a-reservation-holds-its-nights.md)).
  The join is still left: a Stay that began without a Reservation has no Guest
  recorded anywhere, and the Unit names them instead.

### Fixed

- `folio_line_is_postable()` takes a transaction-scoped advisory lock on the
  Stay before it checks anything, and so does
  `stays_withdrawal_is_free_of_charges`. The two guarded one invariant from
  opposite sides and could not see each other: under READ COMMITTED a charge and
  a withdrawal committed together and left a withdrawn Stay carrying money
  ([ADR 0022](../../../docs/adr/0022-a-mistaken-check-in-is-reversed-not-deleted.md)).
  Reproduced on two connections before it was fixed.

### Changed

- `folio_line_is_postable()` also refuses a line on a Folio whose Stay was
  withdrawn. Without it, reversing a check-in left an open Folio attached to a
  Stay that did not happen and it still accepted charges. An invariant rather
  than a closure rule — it says what is representable, not when a Folio should
  be closed. Added by
  [`@ranza/reservations`](../reservations/README.md) in
  `20260916001500_check_in_reversal`; this module still owns the function.

### Added

- The `folios` table: the financial record a Stay accrues against, carrying its
  own currency and holding no total.
- The `folio_lines` table: append-only charges and the reversals that correct
  them, in signed integer minor units.
- `listFolios()`, `folioDetail()`, `postCharge()`, `reverseLine()`,
  `closeFolio()` and `FOLIO_CAPABILITY`.
- `openFolioWithin(tx, stayId)`, so Front Office can open a Folio at check-in
  without writing this module's table. It returns null where the Property does
  not do billing, because `front_desk` and `finance` are separate Entitlements
  and a check-in must not depend on the second.
- A trigger refusing a line on a closed Folio, and a reversal that does not
  cancel its line exactly — two rules a check constraint cannot hold because
  both read another row.
- A second trigger making a posted line unrewritable by every role, including
  the one that runs migrations.
