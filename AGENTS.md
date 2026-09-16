# Working on Ranza

Instructions for AI agents and new contributors. Read this before planning or
changing anything.

## Read first

[`RANZA_PRODUCT_BLUEPRINT.md`](docs/RANZA_PRODUCT_BLUEPRINT.md) is the source of
truth for product scope, domain language, and architecture. Section 15 lists the
rules agents must follow; section 2 defines the canonical vocabulary. This file
does not repeat them — it covers what the blueprint cannot know about this repo.

Authority order (blueprint section 16), highest first:

1. `docs/RANZA_PRODUCT_BLUEPRINT.md`
2. `docs/adr/` — approved decisions
3. Module or release specifications
4. The active implementation issue
5. Code and automated tests

`.claude/` holds vendored agent tooling (ECC), installed with
`npx ecc-universal@2.2.1 install --target claude-project --profile minimal`. It
is gitignored and is **not** part of this authority chain. Its own `AGENTS.md`
describes that plugin, not Ranza, and its generic advice — coverage targets,
style rules — does not override anything above. Where they disagree, this file
wins.

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

**Modules receive their dependencies; they never discover them.** No package
under `packages/` may read `process.env` or construct its own database
connection — `packages/config` is the sole exception, since parsing the
environment is its purpose. A module takes a `deps` object stating what the host
must supply (see `packages/auth/src/ports.ts`). This is what lets a module be
pointed at a throwaway database and reused by another host, and it is enforced by
`scripts/dependency-boundaries.mjs`, not left to discipline.

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
- Credentials are reached through a **separate role**. `auth_user`,
  `auth_session`, `auth_account` and `auth_verification` hold password hashes and
  session tokens; `ranza_auth` reaches them and `ranza_app` is granted nothing.
  RLS is deliberately not used there — authentication happens before any identity
  is known, so role grants are the boundary. Nothing there is tenant-owned.
- Corrections use reversal or revision records. Never delete financial, stock,
  audit or operational history.

## Commands

```sh
pnpm check            # full gate: format, lint, boundaries, typecheck, tests, build
pnpm db:test          # pgTAP suites in tests/database
pnpm test:integration # real database: tenant isolation and the auth flow
```

`pnpm check` must pass before any commit. It does **not** touch a database, so
`db:test` and `test:integration` are separate and must be run when changing
schema, policies or auth.

Local database, when you want to work offline:

```sh
pnpm db:up       # PostgreSQL in Docker, built with pgTAP
pnpm db:setup    # apply migrations, set local role passwords
pnpm db:reset    # down -v, up, setup — local only, never touches a hosted database
pnpm db:seed:dev # a demo Organization and a Staff Member to sign in as
```

`db:seed:dev` needs `pnpm dev` running: it creates the account through the
application's own sign-up route rather than writing the provider-subject mapping
in SQL, because ADR 0005 keeps that mapping in one place.

`.env` points at Supabase by default; the local URLs are commented in it.

## Current state

`main` is the rebuild. The previous pilot is archived at tags
`v0-pilot-archive` and `v0-phase-two-hardening` — recoverable, but its domain
model does not carry forward, and the branches that carried it are gone.

The foundation is verified, not assumed. Run `pnpm db:test` for the pgTAP suites
covering the five gates, and `pnpm test:integration` for tenant isolation under a
pooled Prisma connection, sign-up through to a correctly scoped query, and each
gate denying on its own.

The **walking skeleton stands**. `packages/ranza/core` answers which Properties a
viewer may reach, and `apps/operator-workspace` renders `/{tr,en,ar}/today` from
that answer alone — Arabic right to left, navigation showing only entitled
capabilities. Every tenant read goes through one funnel, `src/server/viewer.ts`,
and reaching around it is a build failure (ADR 0007).

Phase 1's foundations are in progress. `packages/platform/audit` is the first
reusable module: append-only, module-owned schema (ADR 0008), and the first real
subject the tier guards have ever had — the blueprint 9.8 vocabulary scan read
"0 files scanned" until it existed. Notifications, files and tasks are
deliberately not built yet; blueprint section 13 forbids building tables ahead of
the workflows that need them.

The **Resident access path** is the second thing to stand. Accommodation Units
live in `packages/ranza/accommodation`, the Stay in `packages/ranza/stays`, and
`apps/guest-portal` renders `/{tr,en,ar}/stay` mobile-first from one Stay-scoped
read. A Guest or Resident authenticates through the same Better Auth
instance as Staff and then reaches a completely different set of rows — their own
policies, not a widening of the Staff ones. ADR 0008 records that model, and
every later Portal capability is expected to follow it.

Next is the rest of blueprint Phase 2: Reservations, Folios, and the Portal
capabilities of blueprint 4.3 that are specified but not built.

## Keeping documentation true

Documents drift because they **copy** facts that live elsewhere. Prefer pointing
at the source: write "run `pnpm db:test`" rather than "16 assertions pass", and
the sentence cannot go stale.

`pnpm check` fails when a document contradicts the code — a `pnpm <script>` that
does not exist, a broken markdown link, an ADR whose filename and heading
disagree, or an application or module directory with no README. That check is the
reminder; do not rely on remembering.

What it cannot judge is whether a paragraph is still _true_. When a change makes
one of these false, fix it in the same commit:

| When you                             | Update                                            |
| ------------------------------------ | ------------------------------------------------- |
| add or rename a package script       | every doc that shows it (the check finds them)    |
| add an application or module         | its README, and the layout block in `README.md`   |
| change how the database is reached   | `docs/runbooks/supabase-setup.md`, `.env.example` |
| make a decision the code now assumes | a new ADR — not a comment                         |
| reverse or amend a decision          | the existing ADR, with an `Amended:` line         |
| finish or start a milestone          | **Current state** below                           |

## Testing security claims

A passing security test proves nothing until you have seen it fail. Three times
in this repository a green test was verifying nothing:

- the pgTAP runner matched `not ok` against indented psql output, so every suite
  reported green regardless of result
- `ranza_app` existed but nothing connected as it, so "RLS protects queries" was
  never exercised
- an evaluated reference implementation tested isolation by creating a
  non-privileged role inside the test that production never used, while its own
  tables lacked `FORCE` — the policies were correct and completely inert

So: after writing a test that asserts a boundary holds, **break the boundary and
confirm the test goes red.** Point `DATABASE_URL` at a privileged role, invert an
assertion, remove a grant. A test that cannot fail is worse than no test, because
it is mistaken for evidence.

## Conventions

- Vertical slices with externally verifiable behaviour, not a schema built ahead
  of the workflows that need it.
- Turkish, English and Arabic with RTL are designed **with** a feature, never
  retrofitted.
- Do not invent modules, pricing rules, legal policies or integrations that no
  approved specification covers.
- Prizic Control Plane permissions and Organization staff permissions are
  separate systems and must never be mixed.
