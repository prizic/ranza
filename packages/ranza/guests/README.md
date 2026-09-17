# @ranza/guests

Guests — the people a Reservation and a Stay are for (blueprint section 2). A
Guest is short-term and a Resident is long-term; both are people, and this
module holds the person rather than the stay.

Not a Ranza user. Somebody is booked in long before they sign in and most never
do; `stays.user_id` is the separate, nullable fact that gives one a Portal
([ADR 0009](../../../docs/adr/0009-a-resident-reaches-their-own-stay-not-an-organization.md)).

## What this module owns

The `guests` table, its check constraints, and its row-level security policies —
all in
[`prisma/migrations/20260916002000_guests_and_reservation_creation`](../../../prisma/migrations/20260916002000_guests_and_reservation_creation/migration.sql).
No other module writes to that table.

A Guest belongs to an **Organization**, not to a Property, which is the one
decision here worth arguing about and is recorded in
[ADR 0024](../../../docs/adr/0024-a-guest-belongs-to-an-organization-and-a-reservation-holds-its-nights.md).
Every other tenant-owned table in this repository is Property-scoped, so the
write policy cannot use `app.can_use_capability()` directly — it goes through
`app.can_use_capability_in_organization()`, which asks the same four gates of
blueprint 3.5 about any one Property of that Organization the acting Staff
Member reaches.

## Contract

```ts
import { GUEST_DETAILS, identifyGuestWithin } from "@ranza/guests";
```

`identifyGuestWithin(tx, details)` returns the Guest those details name,
creating one when the Organization has nobody matching. Matching is an **exact
email within the Organization** and nothing else: blueprint 18.7 forbids merging
ambiguous people automatically, so a similar name or a shared telephone number
belongs to that review workflow and not to a booking form. Two people booked
with no email are two Guests, which is correct — nothing distinguishes them.

`GUEST_DETAILS` publishes the check constraints' own bounds, so a form's
`maxLength` and the rule it describes cannot drift apart.

It takes the caller's transaction rather than opening one, like
[`openStayWithin`](../stays/README.md) and
[`openFolioWithin`](../folios/README.md): a Guest recorded without the
Reservation that named them is a profile nobody asked for, so they share one
fate.

## Rules

- Only `index.ts` is importable.
- It receives its client and never constructs one, and never reads
  `process.env` ([ADR 0006](../../../docs/adr/0006-modules-take-dependencies-by-injection.md)).
- Flat, with no `domain/` layer, because every rule it has is a constraint or a
  policy in the database ([ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md)).

## What is deliberately not here

Documents, guardians, emergency contacts, preferences, consent and retention
state, duplicate review and the Guest 360 workspace are all blueprint 18.7.
There is no screen for any of them, and blueprint section 13 forbids building
the table ahead of the workflow (see
[`../../../docs/handover/operator-workspace-screens.md`](../../../docs/handover/operator-workspace-screens.md)).
Nothing edits a Guest either: `ranza_app` is granted `update (updated_at)` and
no other column, so editing one is a deliberate act rather than a side effect of
this grant.

Verified against a real database by
[`tests/database/guests_and_reservation_creation.test.sql`](../../../tests/database/guests_and_reservation_creation.test.sql).
