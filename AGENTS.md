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
`npx ecc-universal@2.2.1 install --target claude-project --profile minimal`. All
of it is gitignored except `.claude/skills/feature-design/`, the one skill this
repository owns and commits, and none of it is part of this authority chain. Its own `AGENTS.md`
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
pnpm test:browser     # the workspace in a browser, against the local database
```

`pnpm check` must pass before any commit. It does **not** touch a database, so
`db:test`, `test:integration` and `test:browser` are separate and must be run
when changing schema, policies, auth, or a screen somebody presses a button on.
CI runs `db:test`, `db:drift` and `test:browser` in their own job against a real
PostgreSQL; `test:integration` still runs only by hand.

`test:browser` starts the workspace itself and seeds through it, so it needs
`pnpm db:up` and nothing else. It refuses any database that is not local — it
signs in and checks a Guest in, which leaves history that is never deleted —
and it brings its own Reservation on its own Unit each run, because checking
somebody in is not an act that repeats.

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
pnpm db:drift    # do the migrations and schema.prisma still say the same thing
```

`db:drift` needs `SHADOW_DATABASE_URL` pointing at a **throwaway** database — it
is dropped and recreated. CI runs it, so drift fails the build rather than
turning up later as a `DROP` in somebody's migration (ADR 0001).

`db:seed:dev` needs `pnpm dev` running: it creates the account through the
application's own sign-up route rather than writing the provider-subject mapping
in SQL, because ADR 0005 keeps that mapping in one place.

`.env` points at Supabase by default; the local URLs are commented in it.

## Current state

**[`docs/roadmap.md`](docs/roadmap.md) is where the status lives** — every
bullet of blueprint section 13, what is built, and what the next structural
piece is. It is one page on purpose. This section holds only what a person
needs before writing code, which is different from what they need to know
where the project is.

`main` is the rebuild. The previous pilot is archived at tags
`v0-pilot-archive` and `v0-phase-two-hardening` — recoverable, but its domain
model does not carry forward, and the branches that carried it are gone.

Nothing here is assumed to work because it was written. `pnpm db:test` covers
the five gates of blueprint 3.5 in pgTAP; `pnpm test:integration` covers tenant
isolation under a pooled connection, sign-up through to a correctly scoped
query, and each gate denying on its own.

### Precedents the next module is expected to follow

**A write is bounded by a policy, not by a check** ([ADR 0012](docs/adr/0012-a-write-is-bounded-by-a-policy-not-a-check.md)),
and that policy carries all four of blueprint 3.5's gates rather than reach
alone — a read carries the commercial gates in the query around it and a write
has no such query. **A policy bounds rows; a grant bounds columns.** Row-level
security is row-level, so the policy that lets a Staff Member end a Stay would
equally let them rewrite the Unit and turn a check-out into a room move; a
column-level grant is what stops it.

**An invariant belongs in the database when it can go there.** A Unit cannot
belong to another Organization's Property because of a composite foreign key. Two
current Stays cannot overlap on one Unit because of an exclusion constraint — so
two people checking a Guest in at the same moment end with one Stay and one
refusal from Postgres, rather than from whichever application noticed first.

**A Resident reaches their own rows through their own policies**
([ADR 0009](docs/adr/0009-a-resident-reaches-their-own-stay-not-an-organization.md)),
never through a widening of the Staff ones. Every later Portal capability is
expected to assume that.

**Unbuilt is a position, not an oversight.** Blueprint section 13 forbids
building tables ahead of the workflows that need them, which is why the
Operator Workspace has eleven rail destinations and two built screens. The
others state their purpose and say what has to exist first — see
[`docs/handover/operator-workspace-screens.md`](docs/handover/operator-workspace-screens.md).

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

| When you                              | Update                                            |
| ------------------------------------- | ------------------------------------------------- |
| add or rename a package script        | every doc that shows it (the check finds them)    |
| add an application or module          | its README, and the layout block in `README.md`   |
| change how the database is reached    | `docs/runbooks/supabase-setup.md`, `.env.example` |
| make a decision the code now assumes  | a new ADR — not a comment                         |
| reverse or amend a decision           | the existing ADR, with an `Amended:` line         |
| finish or start a milestone           | `docs/roadmap.md` — the status table, not prose   |
| change what a phase bullet's state is | `docs/roadmap.md`, in the same commit             |

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

Fixtures for anything date-shaped are relative to the Property's own today,
never a fixed date. Fixed dates are what made checking somebody in weeks early
the normal case in two suites that were otherwise asserting the right things.

And run the suites **against the hosted database too**, not only a local one.
A green local run says the migrations produce the right database; it does not
say the hosted database had them applied. The one gap found so far — an audit
table that was append-only everywhere except in production — was invisible to
every local run and took one pgTAP run against Supabase to surface.

## Conventions

- **A feature is designed before it is coded**, by the `feature-design` skill in
  `.claude/skills/feature-design/`, into `docs/features/<feature>/`.
- **Interfaces are Tailwind and shadcn/ui. Do not write CSS.** Components live
  in `packages/ui` and are added with `npx shadcn@latest add`; that package's
  README covers the two fixes every `add` needs. The only stylesheet is
  `packages/ui/src/styles/globals.css`, which holds the theme. A new `.css` file
  or a `className` naming a bespoke class is a mistake, not a local exception.
- Where each piece of a screen belongs — shadcn, the shared kit, or a feature
  folder — is [ADR 0013](docs/adr/0013-an-interface-is-shadcn-a-feature-folder-and-a-shared-kit.md).
  Layout references are `docs/design/ui-references.md`; the palette is
  `docs/design/visual-reference.md`, which wins when they disagree. The theme
  now matches it — teal on a pale canvas — apart from the typeface, which
  departs for a reason recorded in `globals.css`.
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
