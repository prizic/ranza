# 0008. A module owns a PostgreSQL schema, not its own migration history

Status: Accepted
Date: 2026-09-16

## Context

Two accepted sources disagree about where a module's migrations live.

Blueprint section 9.10 says each reusable module owns "its database schema,
migrations, Row-Level Security policies, and data tests". Section 9.12 says each
module owns "a PostgreSQL schema or another equally enforceable namespace, along
with its migrations and policies". Section 9.16 says "database migrations travel
with the owning module and run in a defined order".

[ADR 0001](0001-prisma-owns-schema-sql-owns-rls.md) says there is one migration
history, applied only through Prisma Migrate, because Prisma records applied
migrations in a single `_prisma_migrations` table keyed to one folder. Splitting
that folder means giving up `prisma migrate` and hand-rolling ordering, state and
adoption — the exact machinery ADR 0001 exists to keep.

The disagreement is real and had to be resolved before the first platform module
created a table.

## Decision

The two requirements are separable, and only one of them is enforceable.

**A module owns a PostgreSQL schema.** `platform/audit` owns `audit`, and every
object it creates lives there. No other module is granted anything on it, and
cross-module reads go through a contract rather than a join. This is the half
that a database can enforce, and section 9.12 names it as sufficient: "a
PostgreSQL schema **or another equally enforceable namespace**".

**Migrations stay in one Prisma-owned history.** A module's migration is one file
in `prisma/migrations`, named for the module that owns it, containing the schema,
its policies and its grants together. It is authored with the module and reviewed
in the same diff, which is what "travel with the owning module" is protecting —
but it is applied by the one tool that knows what has already run.

Prisma does not model these tables. A module that owns a schema reaches it with
raw SQL through the injected client, so `prisma/schema.prisma` does not slowly
accumulate every module's private tables and no module gains typed access to
another's.

## Consequences

Ownership is enforced by grants rather than by directory layout, which is the
stronger of the two. Reading a module's tables from outside is denied by the
database, not discouraged by a lint rule.

The cost is that a module's SQL is not physically co-located with its TypeScript.
Its README must point at the migration, and a module extracted to its own
repository later would have to carry that file with it — a move, not a rewrite.

If a module is ever published for a second product (blueprint 9.9), this decision
is revisited: a published package cannot depend on a host's migration folder, and
at that point the extraction cost is worth paying.

Amends nothing in ADR 0001. It answers a question ADR 0001 did not reach.
