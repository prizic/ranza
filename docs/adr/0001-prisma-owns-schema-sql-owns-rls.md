# 0001. Prisma owns the schema, row-level security stays hand-written SQL

Status: Accepted
Date: 2026-09-16
Amended: 2026-09-16 — Supabase removed, so Prisma now owns migrations outright.

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
