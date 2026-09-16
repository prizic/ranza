# Ranza

Ranza is a multilingual, modular, white-label accommodation and hospitality ERP
delivered as one multi-tenant SaaS platform. Organizations operate one or more
Properties and subscribe to capabilities through plans and Entitlements.

[`RANZA_PRODUCT_BLUEPRINT.md`](RANZA_PRODUCT_BLUEPRINT.md) is the source of truth
for product scope, domain language, and architecture. Read it before planning or
changing anything here.

## Status

This branch is a rebuild. The previous student-dormitory pilot is archived at the
`v0-pilot-archive` tag and its domain model does not carry forward — see
[`docs/adr/`](docs/adr) for the decisions that replaced it.

Current milestone: **walking skeleton** — Organization, Property, identity, and
entitlement enforcement proven end-to-end through one application shell.

## Layout

```text
apps/                     separately deployable applications
prisma/                   schema and migrations (RLS policies live in them)
packages/
  platform/               host-agnostic reusable modules
  ranza/                  Ranza domain modules
  adapters/               Ranza-to-platform mappings
  config, i18n, ui, observability
                          cross-cutting infrastructure
```

Tier boundaries are enforced, not documented: `.dependency-cruiser.cjs` rejects
forbidden imports and `scripts/dependency-boundaries.mjs` additionally rejects
Ranza vocabulary appearing inside a reusable platform module.

## Local development

Node.js 22 and pnpm through Corepack:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm check` runs the full gate: formatting, linting, boundary rules, type
checking, tests, and build.

Database work needs Docker and the PostgreSQL client tools:

```sh
pnpm db:up        # plain PostgreSQL, no Supabase
pnpm db:migrate   # apply Prisma migrations
pnpm db:test      # pgTAP suites in tests/database
pnpm db:down
```

Prisma owns schema migrations; row-level security policies are hand-written SQL
appended into the same migration file. Generate with
`prisma migrate dev --create-only`, add the policy SQL, then apply. See
[ADR 0001](docs/adr/0001-prisma-for-queries-sql-for-rls.md).
