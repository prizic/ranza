# Working on Ranza

Instructions for AI agents and new contributors. Read this before planning or
changing anything.

## Read first

[`RANZA_PRODUCT_BLUEPRINT.md`](RANZA_PRODUCT_BLUEPRINT.md) is the source of
truth for product scope, domain language, and architecture. Section 15 lists the
rules agents must follow; section 2 defines the canonical vocabulary. This file
does not repeat them — it covers what the blueprint cannot know about this repo.

Authority order (blueprint section 16), highest first:

1. `RANZA_PRODUCT_BLUEPRINT.md`
2. `docs/adr/` — approved decisions
3. Module or release specifications
4. The active implementation issue
5. Code and automated tests

Lower levels add detail. They never silently contradict a higher one. If you hit
a genuine conflict, **stop and surface it** rather than picking a side quietly.
ADR 0003 exists because the blueprint contradicts itself about who owns
`Property`; that is the expected way to resolve such a conflict.

## Vocabulary — the most common mistake

This repository was previously a student-dormitory pilot. That vocabulary is
**superseded** and must not come back:

| Never use                    | Use instead                                 |
| ---------------------------- | ------------------------------------------- |
| Operator, Dormitory Operator | **Organization**                            |
| Branch                       | **Property**                                |
| Student                      | **Resident** (a Student is a Resident type) |
| tenant (in product language) | **Organization**                            |

Blueprint section 2 makes this binding in code, database naming, issues and
prompts. Pilot terms resurface easily because the archived code and older notes
still use them — treat any appearance as a bug. If you are reading advice that
says "Operator and Branch", it predates the blueprint and its other claims are
suspect too.

## Architecture rules that are enforced, not suggested

Three module tiers, each with a README stating its rule:

- `packages/platform/` — host-agnostic reusable modules. **Must not reference**
  `Property`, `Guest`, `Resident`, `Stay`, `Reservation`, `AccommodationUnit` or
  `Folio` (blueprint 9.8).
- `packages/ranza/` — Ranza domain modules. Hospitality language is fine here.
- `packages/adapters/` — translation between the two. Nothing may depend on it.

Enforcement runs in CI and has fixtures proving it fails when violated:

- `.dependency-cruiser.cjs` — import-level rules and public-contract access
- `scripts/dependency-boundaries.mjs` — scans `platform/` **source text**,
  because a dependency graph cannot see an identifier

Modules expose `index.ts` only. Importing another module's `domain/`,
`application/` or `infrastructure/` is rejected.

## Security invariants — do not weaken these

- **Row-level security is the authorization boundary**, not a backstop.
  Application checks supplement it (blueprint 7.1, story 26).
- The runtime role `ranza_app` is not a table owner and has no `BYPASSRLS`.
  Never run application queries as a privileged role "to make it work".
- Every tenant query goes through `withOrganizationContext()`. Reaching a
  tenant-owned table outside it is a bug: policies see a null user and deny,
  which looks like missing data rather than an error.
- Prisma owns schema migrations; **policies are hand-written SQL** inside the
  same migration. `prisma migrate dev --create-only`, add the SQL, then apply.
- Corrections use reversal or revision records. Never delete financial, stock,
  audit or operational history.

## Commands

```sh
pnpm check        # full gate: format, lint, boundaries, typecheck, tests, build
pnpm db:up        # local PostgreSQL in Docker (no Supabase)
pnpm db:migrate   # apply Prisma migrations
pnpm db:test      # pgTAP suites in tests/database
```

`pnpm check` must pass before any commit.

## Current state

Branch `rebuild/blueprint` is a rebuild. The previous pilot is archived at tags
`v0-pilot-archive` and `v0-phase-two-hardening` — recoverable, but its domain
model does not carry forward.

**Verification debt:** the migrations in `prisma/migrations/` and the pgTAP suite
have never run against a database. Prove them with the commands above before
building anything on top.

Current milestone: the walking skeleton — Organization, Property, identity and
entitlement enforcement proven end to end through `apps/operator-workspace`.

## Conventions

- Vertical slices with externally verifiable behaviour, not a schema built ahead
  of the workflows that need it.
- Turkish, English and Arabic with RTL are designed **with** a feature, never
  retrofitted.
- Do not invent modules, pricing rules, legal policies or integrations that no
  approved specification covers.
- Prizic Control Plane permissions and Organization staff permissions are
  separate systems and must never be mixed.
