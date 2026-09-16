# @ranza/folios

The Folio — the financial record collecting charges, credits, taxes,
adjustments and payments for a Stay (blueprint sections 2 and 5.9) — and the
line posted to it.

This is the first time the product holds money, and money is the thing this
repository already refuses to let anyone delete. Three decisions follow from
that and are recorded in
[ADR 0015](../../../docs/adr/0015-money-is-an-integer-a-balance-is-a-sum-and-a-correction-is-a-line.md):
an amount is an integer count of minor units, a balance is the sum of the lines
and is stored nowhere, and a correction is a further line rather than an edit.

## What this module owns

`folios` and `folio_lines`, their policies, their grants and their triggers, in
[`prisma/migrations/20260916001200_folios`](../../../prisma/migrations/20260916001200_folios/migration.sql).

The same composite foreign keys as everything else, so a Folio pointing at
another Organization's Stay is unrepresentable rather than merely checked. One
Folio per Stay: split folios are blueprint 5.9 and are not built, and the unique
index states that rather than leaving the question open.

`properties.currency` arrives in the same migration. It sits beside `timezone`
for the same reason that does — an Organization may hold Properties in more
than one country, so neither fact can live one level up — and a Folio copies it
when it opens. Re-reading the Property later would silently restate every
historical amount if that Property ever changed currency.

## Contract

```ts
const folios = createFoliosModule({ db }); // the ranza_app client (ADR 0006)
await folios.listFolios(userId, propertyId);
await folios.folioDetail(userId, folioId);
await folios.postCharge(userId, { folioId, description, amountMinor });
await folios.reverseLine(userId, lineId, reason);
await folios.closeFolio(userId, folioId);
```

`openFolioWithin(tx, stayId)` is how Front Office opens a Folio at check-in
(blueprint 6.1 step 5). It takes the caller's transaction rather than opening
one, so the Stay, the Reservation, the Folio and the audit record share one
fate. Exporting it is what keeps the tier rule — no module writes another
module's tables — true rather than merely stated.

It returns **null** rather than raising when the Property does not do billing.
Front Office is gated on `front_desk` and this module on `finance`, so an
Organization holding one Entitlement and not the other must still be able to
check somebody in. A check-in there produces a Stay and no Folio, which is a
state and not a failure.

### The balance is never stored

`listFolios` and `folioDetail` compute it as `sum(amount_minor)` in the same
statement that selects the lines. Not a column, not a view, not a function —
each of those is a second place the definition lives, and a `security definer`
function would be worse than all of them, because it could return a total over
lines the reader cannot see and print it above the ones they can. Aggregating
in the reading statement makes the total and the rows underneath it the same
query's answer.

`folioDetail` runs its two statements in one transaction for the same reason: a
charge posted between them would produce a screen whose total does not match
its own rows.

### A posted line cannot be changed

Not by `ranza_app`, and not by the role that runs migrations. Three independent
mechanisms say so — an absent policy, a revoked grant, and a trigger — and the
third exists because the first two say nothing to a superuser. That is not
theoretical here: the audit module's append-only trigger was added to a
migration that had already reached the hosted database, so the guarantee held
everywhere except in production. See
[`20260916000700_audit_append_only_trigger`](../../../prisma/migrations/20260916000700_audit_append_only_trigger/migration.sql).

A correction is `reverseLine`, which posts `-original.amount_minor` computed by
the database from the row it is cancelling. The amount never travels through
this process, and a trigger refuses a reversal that does not cancel its line
exactly — so `reversal` is a fact rather than a label. A partial correction is
an adjustment, which is a blueprint 5.9 workflow this slice does not build.

### Failures

`FolioWriteError` covers every reason a posting did not happen — out of reach,
the Folio is closed, the line is already reversed, none of it exists. One type
on purpose: told apart, the first would confirm that a Folio the caller cannot
see is there. `FolioAmountError` extends it and is the exception, because an
amount the caller got wrong is the one failure they can act on.

## What is deliberately not here

Blueprint 5.9 also lists charge routing, taxes, discounts, credits, deposits as
recorded value, payment records, refunds, split folios, company billing and
folio closure rules. None of them are in this module, and `line_type` has no
value waiting for them.

**Recording money is not moving money.** Blueprint 5.9 is explicit that
external payment processing is a separately entitled integration. There is no
gateway, no provider column and no pending-capture state here, and adding one
would be inventing a workflow rather than building an approved one.

Accounting is blueprint 5.10 and a different module. When it arrives, an
operational module supplies approved posting events through
`packages/adapters/` — `packages/platform/` may not name a Folio at all
(blueprint 9.8), which `scripts/dependency-boundaries.mjs` enforces by scanning
source text.

A Guest or Resident reaches nothing here. They are denied by absence rather
than by a rule: every condition on these tables resolves through
`app.accessible_property_ids()`, which needs an organization_membership a
Resident does not have ([ADR 0009](../../../docs/adr/0009-a-resident-reaches-their-own-stay-not-an-organization.md)).
When the Portal shows somebody their own Folio it gets its own policy resolving
through `app.resident_stay_property_ids()`, never a widening of these.

## Rules

- Receives its client; never constructs one and never reads `process.env`.
- Only `index.ts` is importable, and only from an application's server funnel
  ([ADR 0007](../../../docs/adr/0007-a-session-becomes-a-request-context.md)).
- Contains no authorization logic of its own. Blueprint 3.5 is decided in the
  database, for writes as well as reads.
- Flat, with no `domain/` or `application/` split, because it has gained no
  rule SQL cannot hold ([ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md)).
  A balance that is only a sum is not such a rule. A rounding or tax policy
  would be, and that is when this grows a domain layer.

Verified against a real database by
[`tests/database/folios.test.sql`](../../../tests/database/folios.test.sql) and
[`tests/integration/folios.test.ts`](../../../tests/integration/folios.test.ts),
each of which was checked by breaking the boundary it asserts — dropping each
trigger, restoring the grant, widening the policy, removing the closing
constraint — and confirming it went red.
