# @ranza/platform-audit

What was done, by whom, and why. A reusable module: it records that something
happened without being able to say what it was.

## Contract

```ts
const audit = createAuditModule({ db }); // the RLS-subject runtime client
await audit.record({
  organizationId, // opaque tenancy scope
  locationId, // where inside it, as the host names it; omit for the whole scope
  actorId, // who acted — never inferred here
  action: "organization.created",
  subjectType: "organization",
  subjectId,
  reason: "why, for actions that require one",
  context: { anything: "else worth explaining later" },
});
await audit.historyOf(actorId, "organization", subjectId);

// Inside a transaction the host owns, after the host's own gate:
const { records, total, nextCursor } = await recentWithin(tx, organizationId, {
  actions,
  locationId,
  from,
  to,
  text,
  actorIds,
  subjectIds,
  cursor,
  limit,
});
const one = await getWithin(tx, organizationId, recordId);
```

A page is newest first, keyset-paged on `(occurred_at, id)`. The cursor holds
the instant in whole microseconds, because a `Date` does not and a cursor
rounded to the millisecond steps past records written in the rest of it.
`total` is its own count and ignores the cursor, so it is how many records
match, not how many are left. `text` matches the reason; `actorIds` and
`subjectIds` are what the host has translated the same text into, because this
module cannot know that a word is a person's name or a room.

`recentWithin` and `getWithin` have no module-method twins on purpose. This module knows a scope as
an opaque identifier and cannot say what one is entitled to, so whichever host
can is the one that opens the transaction, evaluates its gate inside it, and
passes the transaction here — the same arrangement as `recordWithin`. A method
taking an actor and a scope would be a second path to the same rows with no
gate on it.

A subject is an opaque type name and identifier. This module never learns what
one means — that translation is a host adapter's job, which is what lets the
module serve a product with an entirely different vocabulary.

## What holds, and what does not

A record is written once. Three separate things enforce that, because the first
two are not enough:

|                                            | Stops                                  |
| ------------------------------------------ | -------------------------------------- |
| Revoked `UPDATE`/`DELETE` grants           | the runtime role                       |
| No `UPDATE`/`DELETE` policy, under `FORCE` | any role subject to row-level security |
| A `before update or delete` trigger        | owners and superusers too              |

The third exists because the first version of the test suite asserted that
`FORCE ROW LEVEL SECURITY` was sufficient, and it was not: the migration role is
a superuser locally and may carry `BYPASSRLS` on a hosted database, so the
rewrite went straight through. The assertion caught it.

None of this survives a determined database administrator — a superuser can drop
the trigger. That is an operational control, not a constraint, and the module
does not pretend otherwise.

A location is an opaque id like the scope. The host defines what one is and who
reaches it, in the `app.audit_*` functions the policies call
([ADR 0031](../../../docs/adr/0031-an-audit-record-carries-its-location-and-is-read-by-permission.md)):
a reader sees what they wrote, and — holding the host's read permission — the
records at locations they reach, plus the whole-scope records when they reach
the whole scope. A record can only be written in the actor's own name, at a
location inside its scope, and never with a time of the writer's choosing: the
insert grant is a column list without `occurred_at`.
A denied write raises; it never returns quietly, because an action that happened
without a record is the thing this module exists to prevent.

## Where things live

- Schema, policies, grants and trigger:
  [`prisma/migrations/20260916000300_platform_audit`](../../../prisma/migrations/20260916000300_platform_audit/migration.sql),
  and the location and read reach in
  [`20260916004200_an_audit_record_carries_its_location`](../../../prisma/migrations/20260916004200_an_audit_record_carries_its_location/migration.sql)
  — one Prisma history, module-owned schema ([ADR 0008](../../../docs/adr/0008-a-module-owns-a-schema-not-a-migration-history.md)).
- `src/domain/` invariants, `src/application/` the contract, `src/infrastructure/`
  the only SQL. Importers reach `index.ts` and nothing else.
- Proof: [`tests/database/platform_audit.test.sql`](../../../tests/database/platform_audit.test.sql),
  [`tests/database/audit_location_reach.test.sql`](../../../tests/database/audit_location_reach.test.sql)
  and [`tests/integration/audit.test.ts`](../../../tests/integration/audit.test.ts).
