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
- **An applied migration is never edited.** `prisma migrate deploy` does not
  re-run one, and does not refuse one whose contents have changed — it reports
  success and moves on. This has already happened once: the audit module's
  append-only trigger was added to `20260916000300_platform_audit` after that
  file had reached the hosted database, so the guarantee held in the repository,
  in its test, and in every database built from scratch, and did not hold in
  production. A correction is a new migration, written so that applying it
  anywhere is safe — see `20260916000700_audit_append_only_trigger`.
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

It does, however, run `next build`, which writes into the same `.next` a running
`pnpm dev` is serving from. Every route 404s afterwards, including ones that
plainly exist — restart the dev server rather than hunting for the routing bug
it looks like.

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
policies, not a widening of the Staff ones. ADR 0009 records that model, and
every later Portal capability is expected to follow it.

**Multi-factor authentication** closes the identity line of Phase 1. A second
factor is a property of the account rather than of a membership (ADR 0010), so
one enrolment covers both applications — `apps/operator-workspace` has the
enrolment screen at `/{tr,en,ar}/security`, and `apps/guest-portal` answers the
challenge without one. The secret sits beside the password hash, reached only by
`ranza_auth`, and rate-limit counters share a table so a limit is one limit
rather than one per server instance (blueprint 7.6). Nothing can yet _require_
MFA — blueprint 7.6 asks for it on privileged roles — and there is no
operator-assisted reset for a lost authenticator; the amendment to ADR 0010 says
where both belong.

Phase 1 still has real gaps: white-label tokens and domains, Feature
Configuration beyond on/off Property capabilities, notifications, files, tasks
and integrations, and two of the four applications. The generic foundations stay
unbuilt on purpose — blueprint section 13 forbids tables ahead of the workflows
that need them.

The **front desk writes** is where Phase 2 starts, and it is the first mutation
in the product. `packages/ranza/reservations` owns the Reservation and the
check-in that turns one into a Stay: one transaction that creates the Stay, moves
the Reservation and records the actor, or does none of the three.
`apps/operator-workspace` renders `/{tr,en,ar}/arrivals` and `/departures` from
it — two routes rather than two tabs, each a `DataTable` with search, sorting
and column visibility, and one action per row.

Two things there are worth knowing before writing the next module, because both
are precedent. **A write is bounded by a policy, not by a check** — ADR 0012 —
and that policy carries all four of blueprint 3.5's gates rather than reach
alone, because a read carries the commercial gates in the query around it and a
write has no such query. And **availability is a constraint**:
`stays_no_double_booking` is an exclusion constraint over `btree_gist`, so two
people checking a Guest into the same Unit at the same moment end with one Stay
and one refusal from the database rather than from whichever application noticed
first.

Writing that ADR found two policy clauses whose removal changed no observable
behaviour — the tests written for them were evidence of nothing. The break-it-and-
watch-it-go-red rule below applies to each clause of a policy, not to the policy
as a whole.

Check-out closes the other half of that bullet. `ranza_app` may update a Stay's
`status`, `ends_on` and `updated_at` and nothing else, by a **column-level
grant** — because row-level security is row-level, and the policy that lets a
Staff Member end a Stay would otherwise let them rewrite the Unit and turn a
check-out into a room move. A policy bounds rows; a grant bounds columns
(ADR 0012, amended).

The rail now carries all eleven blueprint 4.6 destinations. Two are built;
the rest are gated routes that state their purpose and say what has to exist
first — `docs/handover/operator-workspace-screens.md` is the note a new
contributor reads before starting one. They are stubs on purpose: blueprint
section 13 forbids building tables ahead of the workflows that need them, so an
unbuilt screen is a position rather than an oversight.

Phase 2 continues with the rest of blueprint 5.3 — group reservations,
quotations, deposits, availability search, extensions, room moves, check-out and
no-show handling, none of which are built — then Folios, and the Portal
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

And run the suites **against the hosted database too**, not only a local one.
A green local run says the migrations produce the right database; it does not
say the hosted database had them applied. The one gap found so far — an audit
table that was append-only everywhere except in production — was invisible to
every local run and took one pgTAP run against Supabase to surface.

## Conventions

- **Interfaces are Tailwind and shadcn/ui. Do not write CSS.** Components live
  in `packages/ui` and are added with `npx shadcn@latest add`; that package's
  README covers the two fixes every `add` needs. The only stylesheet is
  `packages/ui/src/styles/globals.css`, which holds the theme. A new `.css` file
  or a `className` naming a bespoke class is a mistake, not a local exception.
- Where each piece of a screen belongs — shadcn, the shared kit, or a feature
  folder — is [ADR 0013](docs/adr/0013-an-interface-is-shadcn-a-feature-folder-and-a-shared-kit.md).
  Layout references are `docs/design/ui-references.md`; the palette is
  `docs/design/visual-reference.md`, **which the current theme does not match
  yet** and which wins when they disagree.
- Directional utilities are always logical — `ps`/`pe`, `border-s`,
  `text-start`. That is what makes Arabic mirror by construction.
- Applications should have no `src/` and should import through `@/`, not
  `../../../../` — [ADR 0014](docs/adr/0014-an-application-is-flat-and-its-imports-are-aliased.md).
  **That is agreed and not yet applied**, so the tree still has both; do not
  treat the current shape as the intent, and do not deepen it further than a
  route already requires.
- Vertical slices with externally verifiable behaviour, not a schema built ahead
  of the workflows that need it.
- Turkish, English and Arabic with RTL are designed **with** a feature, never
  retrofitted.
- Do not invent modules, pricing rules, legal policies or integrations that no
  approved specification covers.
- Prizic Control Plane permissions and Organization staff permissions are
  separate systems and must never be mixed.
