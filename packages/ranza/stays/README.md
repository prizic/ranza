# @ranza/stays

The Stay: the operational record connecting a Guest or Resident to an
Accommodation Unit for a period (blueprint sections 2 and 5.3). Short-term and
long-term are the same record told apart by `stay_type`, not two models — which
is what keeps a dormitory a Property configuration rather than a second product
([ADR 0004](../../../docs/adr/0004-student-residence-is-a-property-configuration.md)).

## What this module owns

The `stays` table and, with it, the **Resident access path** — a second way into
the database that
[ADR 0009](../../../docs/adr/0009-a-resident-reaches-their-own-stay-not-an-organization.md)
describes and every later module has to assume. Both live in
[`prisma/migrations/20260916000500_stays_and_resident_access`](../../../prisma/migrations/20260916000500_stays_and_resident_access/migration.sql).

A Stay carries `organization_id` and `property_id` next to
`accommodation_unit_id`, and a composite foreign key across all three proves the
Unit is in that Property in that Organization. `user_id` is nullable: most Stays
are created by Staff for someone who has never signed in, and a Stay with no
user simply has no Portal.

## Contract

```ts
const stays = createStaysModule({ db }); // db: the ranza_app client (ADR 0006)
await stays.listOwnStays(userId);
```

`openStayWithin(tx, stay)` and `closeStayWithin(tx, stayId, departedOn)` are how
Front Office creates and ends a Stay. They take the caller's transaction rather
than opening one, because a check-in creates the Stay, moves the Reservation and
records the actor and those three share one fate. Exporting them is what keeps
the tier rule — no module writes another module's tables — true rather than
merely stated.

`ranza_app` may `UPDATE` only `status`, `ends_on` and `updated_at`, by a
column-level grant. A check-out therefore cannot become a room move, which no
row-level policy could have expressed.

`listOwnStays` is one statement so two independent things must hold for a row to
come back, either enough to deny on its own: the row-level security policies
(which is also why the joins to `properties` and `accommodation_units` return
nothing when they are removed), and `app.resident_can_use_capability()`, which
re-checks Subscription, Entitlement, Property capability and that the Stay is in
that Property.

A Staff Member calling it gets an empty array. A membership is not a Stay, and
the Portal grants no staff capability (blueprint 4.3).

Empty is also the answer for a departed Resident, for an Organization that lost
the Entitlement, and for a Property that never enabled
`portal_stay_overview`. Those are different situations given deliberately
identical answers.

## Giving a Guest the Portal

A Resident reaches the Portal by a link the desk hands over
([ADR 0060](../../../docs/adr/0060-a-resident-gets-the-portal-by-an-invitation-of-their-guest.md)).
The invitation is of a Guest, so a student registered in move-in week can have
one before any Stay exists, and accepting it gives that Guest's own current
Stays to the account.

```ts
await stays.overview(userId, reservationId); // where the invitation stands, and may the desk offer one
await stays.invite(userId, reservationId); // { token, expiresAt, replacedEarlier }, the token shown once
await stays.withdraw(userId, reservationId); // false when no link was live
await stays.link(token); // what the page behind a link may say; null if it never existed
await stays.accept(userId, token); // { outcome, linkedStays }, a refusal is an outcome
```

The token is made here and only its SHA-256 digest crosses into the database, in
a column the runtime role is not granted. Every rule is in
`app.invite_guest_to_portal`, `app.withdraw_portal_invitation`,
`app.portal_invitation_state` and `app.accept_portal_invitation`; this module
asks inside the right request context and turns a SQLSTATE into a word.
`link` runs without a request context because the person holding the link cannot
sign in yet. Instants cross the driver as UTC text, because a `timestamptz` read
through a raw query came back shifted by the session's offset.

`listOwnStays` also returns the room around a bed (a policy of its own on
`accommodation_units`) and the balance of the Stay's Folio
(`app.resident_folio_balances()`). A Stay with no Folio has `balance: null`,
which is not a zero balance (ADR 0015).

## Rules

- Receives its client; never constructs one and never reads `process.env`.
- Only `index.ts` is importable, and only from an application's server funnel
  ([ADR 0007](../../../docs/adr/0007-a-session-becomes-a-request-context.md)).
- Contains no authorization logic of its own. Blueprint 3.5 is decided in the
  database, where an application defect cannot skip it.

Verified against a real database by
[`tests/database/resident_access_path.test.sql`](../../../tests/database/resident_access_path.test.sql)
and
[`tests/integration/portal-access.test.ts`](../../../tests/integration/portal-access.test.ts),
each of which was itself checked by breaking the boundary and confirming it went
red.
