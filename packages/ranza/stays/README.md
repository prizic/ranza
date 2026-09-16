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
