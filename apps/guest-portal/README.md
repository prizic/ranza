# guest-portal

The Guest/Resident Portal (blueprint section 4.3): a mobile-first web
application where a Guest or Resident sees their own Stay. Separately
deployable, and it imports nothing from `operator-workspace` —
`.dependency-cruiser.cjs` rejects that.

## What it shows

One thing: the viewer's own current Stay — Property, Accommodation Unit,
arrival and departure. Blueprint 4.3 lists more (service requests,
announcements, meal choices, attendance declarations, Folio balances) and none
of them are built, so none of them appear.

Everything comes from a single read,
[`ownStays`](src/server/viewer.ts), which is the only tenant query this
application makes.

## The boundary that defines this application

The Portal must never expose staff controls or Prizic operations
(blueprint 4.3). That is enforced in three places rather than observed in one:

1. **The composition root does not compose `@ranza/core`.** The strongest form
   of "the Portal cannot show staff data" is an application that cannot express
   the question. Nothing here can answer "which Properties may this Staff
   Member reach".
2. **The database gives a Resident different rows.** They authenticate through
   the same Better Auth instance and map to the same kind of Ranza user, then
   reach their own Stay and nothing else — their own policies, not a widening
   of the Staff ones. See
   [ADR 0008](../../docs/adr/0008-a-resident-reaches-their-own-stay-not-an-organization.md).
3. **A Staff Member signing in here gets an empty state.** A membership is not
   a Stay, so the Portal grants them no capability at all. That is asserted in
   `tests/integration/portal-access.test.ts`, not assumed.

The empty state is deliberately ambiguous. No Stay, a departed Stay, a revoked
Entitlement and a Property that never enabled the capability all render the
same thing: what a viewer may not reach should not be distinguishable from what
does not exist. The cost is that Portal problems cannot be diagnosed from the
interface — the database tests are where those four cases are told apart.

## Shape

```text
src/
  server/composition.ts   the one place that reads the environment (ADR 0006)
  server/viewer.ts        session -> Ranza user -> request context (ADR 0007)
  app/[locale]/           every route is locale-prefixed
    (portal)/stay/        the Stay
    sign-in/              outside (portal): the shell above it requires a viewer
  messages.ts             tr, en and ar — no fallback locale
  portal.css              only what differs because this is read on a phone
```

`src/server/viewer.ts` is this application's own funnel. ADR 0007 requires one
per application and forbids reusing the Workspace's; the three steps are the
same but land on different policies. Nothing outside `src/server/` may import
`@ranza/db` or a Ranza domain module, which is a build failure with a fixture
proving the rule fires.

## Localization and layout

Turkish, English and Arabic, with `dir="rtl"` set on `<html>` for Arabic from
the first render rather than by a client effect. `portal.css` uses logical
properties throughout, so Arabic mirrors by construction.

Designed at 390px and allowed to grow. Most of that comes free from
`@ranza/ui`: the fact grid is `auto-fit` and
reflows on its own, and the chrome is already fluid. `portal.css` holds only
what genuinely differs on a phone — a Property name needs a smaller voice than
the Workspace's weekday, the Unit takes the place the Workspace gives the
clock, and the gate uses `svh` so it is not pushed off-screen by the mobile URL
bar.

Calendar dates are formatted in UTC because a Stay's arrival is a date, not an
instant — anything else shifts it by a day for a viewer west of the meridian.

Not yet a PWA in the installable sense. That needs a web manifest with real
icon assets and none exist; the application is responsive and mobile-first
today, which is the part that has substance.

## Running it

```sh
pnpm dev
```

Serves on port 3001, so it can run beside `operator-workspace` on 3000.
`DATABASE_URL`, `AUTH_DATABASE_URL` and `BETTER_AUTH_SECRET` must be set — see
[`.env.example`](../../.env.example).
