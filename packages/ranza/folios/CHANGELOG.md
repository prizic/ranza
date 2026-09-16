# @ranza/folios

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

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
