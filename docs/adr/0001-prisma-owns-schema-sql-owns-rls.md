# 0001. Prisma owns the schema, row-level security stays hand-written SQL

Status: Accepted
Date: 2026-09-16
Amended: 2026-09-16 — Supabase removed, so Prisma now owns migrations outright.
Amended: 2026-09-16 — partial indexes move into `schema.prisma`, and drift
between the migrations and the schema is now a build failure rather than a
discovery.

## Context

Blueprint section 9.13 permits Prisma for server-side access but requires RLS
policies to remain explicit, module-owned SQL and the runtime database role to
stay subject to tenant isolation.

The original version of this ADR paired Prisma with Supabase, which left two
systems able to apply DDL to one database. ADR 0002 removed Supabase, so Prisma
Migrate is now the single migration engine.

## Decision

Prisma provides type-safe queries and owns schema migrations. RLS policies,
security-definer functions, and grants are written by hand as raw SQL appended
into the same Prisma migration that creates the objects they protect:

```sh
pnpm db:migrate:new   # prisma migrate dev --create-only
# edit prisma/migrations/<name>/migration.sql to add policies, functions, grants
pnpm db:migrate       # prisma migrate deploy
```

`deploy` rather than `dev` everywhere that is not authoring: `dev` may offer to
reset a database, which must never be possible against a shared one.

Migrations are applied only through Prisma, never by piping the SQL to `psql`.
Doing so leaves `_prisma_migrations` empty, and Prisma then treats the database
as unmigrated and offers to reset it. An existing database can be adopted with
`prisma migrate resolve --applied <name>`.

One migration history, one tool. A policy and the table it guards land in the
same reviewable diff.

The runtime connection uses `ranza_app`, a role that is neither the table owner
nor `BYPASSRLS`. Because Prisma pools connections under one role, every request
publishes its acting user inside the transaction that runs the query via
`app.set_request_context()`. Migrations use a separate direct connection whose
role is never used at runtime.

### A partial index is Prisma's, not SQL's

Partial indexes used to be hand-written, under a comment saying Prisma could not
express them. Prisma 7.4 added the `partialIndexes` preview feature and this
repository runs 7.10, so `@@index` and `@@unique` take a `where` and the index
belongs in `schema.prisma` like any other.

That is not a tidiness argument. What Prisma cannot see, Prisma removes: three
partial indexes existed only in migration SQL, and `migrate diff` wanted to DROP
all three. The next `prisma migrate dev` would have silently taken them —
`organization_memberships_user_idx`, `property_assignments_user_idx` and
`stays_user_idx`, the last of which is the Resident access path's only index.
They are modelled now, along with the partial unique on `stays` that issue #34
produced.

Two things to know before writing one.

**A raw predicate must be spelled the way Postgres stores it.** `migrate diff`
compares the predicate text, and Postgres normalises: `status in ('a','b')`
becomes `status = ANY (ARRAY['a'::text, 'b'::text])`, and a schema that says the
first will differ from a database that says the second, forever. The typed form
— `where: { status: { not: "cancelled" } }` — avoids the question and is
preferred, but it supports only equality and `not`; anything else is `raw()` and
has to match. `pg_get_expr(indpred, indrelid)` says what the database thinks.

**A preview feature is a standing upgrade risk.** `partialIndexes` is not GA. If
a future Prisma renames the argument, changes its syntax, or drops the flag, the
schema stops parsing and every command fails — including `generate`, which CI
runs before anything else. The failure is loud rather than silent, which is the
right direction, but a Prisma upgrade now has to check this feature first. The
alternative was worse: leaving the indexes invisible to Prisma is what created
the DROP.

## Consequences

Per-transaction context propagation is the load-bearing risk. If any path
forgets it, policies see a null acting user and deny — failing safe, but looking
like missing data rather than an error. Every tenant query therefore goes
through `withOrganizationContext()`; reaching a tenant table outside it is a bug.

This costs one transaction per tenant query. That is inherent to how Prisma
reaches session state and no connection pooler removes it. Accepted knowingly.

Prisma Migrate is one history, which is a partial deviation from section 9.10's
module-owned migrations. Ownership is expressed instead through a Postgres schema
per module and split `schema.prisma` files. Running two migration engines against
one database trades a documentation nicety for an ordering hazard, and is not
worth it.

`prisma migrate diff --from-migrations --to-schema` reports no difference, and
CI fails when it does. That is what turns "the schema and the migrations agree"
from a claim into a check. It needs a throwaway shadow database, configured as
`SHADOW_DATABASE_URL` and deliberately undefaulted: a shadow database is dropped
and recreated, so a guessed URL is how a real one gets erased.
