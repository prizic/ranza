# Operator Workspace screens — handover

Every destination in the rail, what it is for, and what has to exist before it
can be built. Four are built; the rest are routes with a stated purpose and
nothing behind them.

This exists because a stub with no note is indistinguishable from an oversight.

## Read first

- [`../RANZA_PRODUCT_BLUEPRINT.md`](../RANZA_PRODUCT_BLUEPRINT.md) section 4.6
  lists these destinations, and section 5 specifies the modules behind them.
  Where this file and the blueprint disagree, the blueprint wins.
- [`../../AGENTS.md`](../../AGENTS.md) — vocabulary, the tier rules, and the
  security invariants. Not optional reading before a first change.
- [ADR 0012](../adr/0012-a-write-is-bounded-by-a-policy-not-a-check.md) if the
  screen writes anything, and
  [ADR 0013](../adr/0013-an-interface-is-shadcn-a-feature-folder-and-a-shared-kit.md)
  for where each piece of a screen belongs.
- [`../design/ranza-mockup.html`](../design/ranza-mockup.html) — open it in a
  browser to see what a screen is trying to become. It shows twenty-eight
  destinations to this rail's eleven; the difference is Phase 3 to 5 modules,
  not screens somebody forgot. It is a shape reference and the blueprint wins
  over it — see the note at the end of
  [`../design/ui-references.md`](../design/ui-references.md) for what it invents.

## Getting a workspace to look at

```sh
pnpm db:up && pnpm db:setup
pnpm dev
pnpm db:seed:dev
```

Sign in at `http://localhost:3000/tr/today` as `deniz@example.test` /
`correct-horse-battery-staple`. The seed grants every capability in this table,
so all eleven destinations appear — which they would not on a real Organization
that had bought two of them.

## The rule that decides the order

**Blueprint section 13 forbids building tables ahead of the workflows that need
them.** So the order below is not a backlog to work through — a screen is built
when someone needs the workflow, and the module under it is built then too, in
the same vertical slice. A screen whose module does not exist is not "blocked";
it is correctly unbuilt.

## How a screen gets built

The same five steps every time. `arrivals` and `departures` are the worked
example — read them before starting a new one. `reservations` is the most recent
one and the only one so far that added a table as well as a screen, so it is
worth reading if the next slice does too.

1. **The module.** A package under `packages/ranza/` owning its tables, with the
   migration carrying the schema, the policies and the grants together
   (ADR 0001, ADR 0008). Flat until it has a rule SQL cannot hold (ADR 0011).
2. **The policies, and the tests that prove them.** A pgTAP suite in
   `tests/database/`, and then **break each boundary and confirm it goes red**.
   This is not optional and it is not a formality — three suites in this
   repository have been green while verifying nothing, and two policy clauses
   were found doing nothing this way.
3. **The read, through the funnel.** Add it to `src/server/viewer.ts`. Nothing
   outside `src/server/` may import `@ranza/db` or a Ranza module; that is a
   build failure with a fixture proving the rule fires (ADR 0007).
4. **The screen.** A folder under `src/features/<domain>/` with the table, its
   columns, the detail panel and the row actions. Presentational — it receives
   data from the route as props.
5. **The gate.** Set `built: true` in `src/lib/screens.ts`, and give the
   capability an entitlement row in `scripts/db-seed-dev.mjs` so it appears.

Run `pnpm check`, `pnpm db:test` and `pnpm test:integration` — against the local
database **and** against Supabase. A green local run does not say the hosted
database has the migration.

## The screens

| Route                   | Blueprint | State           | What it needs first                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `today`                 | 18.4      | **built**, thin | Nothing new. It is a clock and two facts; 18.4 asks for arrivals, departures, Unit readiness and blockers, each opening the records that resolve it.                                                                                                                                                                                                                                                                                                                |
| `reservations`          | 5.3, 18.6 | **built**       | Nothing. What is booked at this Property from today onwards, and the form that takes one — a Guest, a Unit and the nights, in one transaction ([ADR 0024](../adr/0024-a-guest-belongs-to-an-organization-and-a-reservation-holds-its-nights.md)). No row actions, because nothing cancels, amends or moves a Reservation. Blueprint 18.6's timeline, conflict preview and side drawer are the shape this becomes; it is a list until a Unit has a floor and a rate. |
| `arrivals` `departures` | 5.3       | **built**       | Nothing. The worked example — the list, check-in, check-out, and withdrawing a mistaken check-in with a reason ([ADR 0022](../adr/0022-a-mistaken-check-in-is-reversed-not-deleted.md)).                                                                                                                                                                                                                                                                            |
| `guest-experience`      | 5.5       | planned         | A requests table with a status lifecycle, and the Portal side that raises one. Blueprint 4.3 lists the Portal capabilities; none are built beyond the Stay.                                                                                                                                                                                                                                                                                                         |
| `housekeeping`          | 5.4       | planned         | A Unit status lifecycle — available, occupied, dirty, inspected, blocked, out of order (18.2). `accommodation_units.status` currently allows three of those. Check-out is the natural trigger for "dirty" and deliberately does not set it yet, which makes this screen the workflow that gives `apps/worker` its first outbox handler.                                                                                                                             |
| `food-and-beverage`     | 5.6       | planned         | Outlets, meal plans and consumption. Depends on Inventory for stock movement, and on a Folio to post a charge to.                                                                                                                                                                                                                                                                                                                                                   |
| `inventory`             | 5.7, 5.8  | planned         | Stock items, movements and counts. The reusable half belongs in `packages/platform/inventory`, with a host adapter translating Ranza concepts — `packages/platform` may not name a Property or a Stay (blueprint 9.8).                                                                                                                                                                                                                                              |
| `finance`               | 5.9       | **built**       | `features/finance/`. A Property's Folios with their balances, one Folio's lines, adding a charge, reversing one and closing. Payments, taxes, discounts and split folios are blueprint 5.9 and are not built; Accounting is 5.10 and a separate module behind an adapter.                                                                                                                                                                                           |
| `people`                | 7.2       | built           | Staff and permissions: the roster, inviting a colleague, revoking and undoing it. Backed by `@ranza/staff` and proved by `tests/browser/staff.spec.ts`. Roles and the permission grid are slices 2 and 3 and are not on it yet. Human Resources (5.11) — contracts, wages, documents — is a separate destination and is not this one.                                                                                                                               |
| `analytics`             | 5.14      | planned         | Occupancy and revenue reporting. Both halves are readable now: occupancy from Stays, revenue from Folio lines.                                                                                                                                                                                                                                                                                                                                                      |
| `configuration`         | 5.1       | planned         | Organization, Property, Unit and capability settings. Writing a Property is a new write path — reread ADR 0012 before starting, in particular that a policy bounds rows and a grant bounds columns.                                                                                                                                                                                                                                                                 |

## Where the pieces are

```text
apps/operator-workspace/src/
  lib/screens.ts        the destination list — one place, drives rail and titles
  lib/nav.ts            builds the rail tree from it
  lib/page-titles.ts    builds the page bar's titles from it
  server/viewer.ts      the only path to tenant data (ADR 0007)
  features/<domain>/    a screen's table, columns, panel, actions (ADR 0013)
  app/[locale]/(workspace)/<segment>/page.tsx
```

Adding a destination is one entry in `screens.ts` plus a `page.tsx`. The rail,
the page bar and the section tabs all read that list, so they cannot disagree
about what exists.

## Two things that will bite

**The stubs are gated like everything else.** A viewer whose Organization is not
entitled sees the empty state, not the planned screen. That is deliberate —
blueprint 4.6 says navigation shows only entitled capabilities and locked
upsells do not clutter it — but it means a screen can look "missing" when it is
only unentitled. `scripts/db-seed-dev.mjs` grants all of them locally.

**`pnpm check` runs `next build`**, which writes into the same `.next` a running
`pnpm dev` serves from. Every route 404s afterwards, including ones that plainly
exist. Restart the dev server rather than hunting for the routing bug it looks
like.
