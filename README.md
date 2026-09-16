# Ranza

Ranza is a multilingual, modular, white-label accommodation and hospitality ERP
delivered as one multi-tenant SaaS platform. Organizations operate one or more
Properties and subscribe to capabilities through plans and Entitlements.

[`RANZA_PRODUCT_BLUEPRINT.md`](docs/RANZA_PRODUCT_BLUEPRINT.md) is the source of truth
for product scope, domain language, and architecture. Read it before planning or
changing anything here.

Contributors and AI agents should start with [`AGENTS.md`](AGENTS.md), which
covers the authority order, the enforced architecture rules, the security
invariants, and the vocabulary that must not regress to pilot terms.

## Status

This branch is a rebuild. The previous student-dormitory pilot is archived at the
`v0-pilot-archive` tag and its domain model does not carry forward — see
[`docs/adr/`](docs/adr) for the decisions that replaced it.

The **walking skeleton** stands: Organization, Property, identity and
entitlement enforcement proven end to end through `apps/operator-workspace`, in
Turkish, English and Arabic. Next is blueprint Phase 2 — Accommodation Units,
Reservations, Stays and Folios.

## Layout

```text
apps/                     separately deployable applications
  operator-workspace/     the main authenticated application
  storefront/             public marketing and lead capture
  guest-portal/           where a Guest or Resident sees their own Stay
  control-plane/          Prizic-internal administration
packages/
  platform/               host-agnostic reusable modules (generic subdomains)
    audit/                what was done, by whom, and why
  ranza/                  Ranza domain modules (core domain)
    core/                 Organization, Property, membership, Entitlement reads
    accommodation/        Accommodation Units inside a Property
    stays/                Stays, and the Resident access path
    reservations/         Reservations, check-in, and the first write path
  adapters/               Ranza-to-platform mappings
  config, db, i18n, ui, observability
                          cross-cutting infrastructure
prisma/                   schema and migrations (RLS policies live in them)
tests/                    unit, database (pgTAP) and boundary fixtures
```

Each tier has a README stating the rule that defines it. The one that matters
most: a `platform/` module may not reference `Property`, `Guest`, `Stay` or
`Folio` — see [packages/platform/README.md](packages/platform/README.md).

Tier boundaries are enforced, not documented: `.dependency-cruiser.cjs` rejects
forbidden imports and `scripts/dependency-boundaries.mjs` additionally rejects
Ranza vocabulary appearing inside a reusable platform module, and any module
reading `process.env`.

An application may reach the database only through its own server funnel — see
[ADR 0007](docs/adr/0007-a-session-becomes-a-request-context.md). That rule is
enforced by the same pair, with fixtures proving both fire.

## Local development

Node.js 22 and pnpm through Corepack:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm check` runs the full gate: formatting, linting, boundary rules, type
checking, tests, and build.

`pnpm check` does not touch a database. Schema, policy and auth changes are
covered by separate suites:

```sh
pnpm db:test          # pgTAP suites in tests/database
pnpm test:integration # tenant isolation and the auth flow, against a real database
```

`.env` points at the hosted database by default. To work offline you need Docker
and the PostgreSQL client tools:

```sh
pnpm db:up      # PostgreSQL in Docker, built with pgTAP
pnpm db:setup   # apply migrations, set local role passwords
pnpm db:reset   # rebuild from scratch — local only
```

Ranza has no self-service sign-up by design, so a fresh database has nobody who
can sign in. With `pnpm dev` running, `pnpm db:seed:dev` creates a demo
Organization, two Properties and a Staff Member to sign in as — see
[apps/operator-workspace/README.md](apps/operator-workspace/README.md).

Prisma owns schema migrations; row-level security policies are hand-written SQL
appended into the same migration file. Generate with
`prisma migrate dev --create-only`, add the policy SQL, then apply. See
[ADR 0001](docs/adr/0001-prisma-owns-schema-sql-owns-rls.md).
