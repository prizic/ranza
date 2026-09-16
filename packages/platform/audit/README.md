# @ranza/platform-audit

What was done, by whom, and why. A reusable module: it records that something
happened without being able to say what it was.

## Contract

```ts
const audit = createAuditModule({ db }); // the RLS-subject runtime client
await audit.record({
  organizationId, // opaque tenancy scope
  actorId, // who acted — never inferred here
  action: "organization.created",
  subjectType: "organization",
  subjectId,
  reason: "why, for actions that require one",
  context: { anything: "else worth explaining later" },
});
await audit.historyOf(actorId, "organization", subjectId);
```

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

Reads and writes are scoped by row-level security to the Organizations the
acting user reaches, and a record can only be written in the actor's own name.
A denied write raises; it never returns quietly, because an action that happened
without a record is the thing this module exists to prevent.

## Where things live

- Schema, policies, grants and trigger:
  [`prisma/migrations/20260916000300_platform_audit`](../../../prisma/migrations/20260916000300_platform_audit/migration.sql)
  — one Prisma history, module-owned schema ([ADR 0008](../../../docs/adr/0008-a-module-owns-a-schema-not-a-migration-history.md)).
- `src/domain/` invariants, `src/application/` the contract, `src/infrastructure/`
  the only SQL. Importers reach `index.ts` and nothing else.
- Proof: [`tests/database/platform_audit.test.sql`](../../../tests/database/platform_audit.test.sql)
  and [`tests/integration/audit.test.ts`](../../../tests/integration/audit.test.ts).
