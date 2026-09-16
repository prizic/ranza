# operator-workspace

The main authenticated application: Organization owners, managers and Staff
Members (blueprint 4.2). Next.js App Router, locale-prefixed, installable as a
PWA later.

```sh
pnpm dev            # this app on http://localhost:3000
pnpm db:seed:dev    # in another terminal: a demo Organization and an account
```

It needs `DATABASE_URL`, `AUTH_DATABASE_URL` and `BETTER_AUTH_SECRET` — see
[`.env.example`](../../.env.example). Building needs none of them: the
composition root is built on first request, not at import.

## There is no sign-up, and there will not be one

A Staff Member does not create their own account. Prizic Control Plane creates
the Organization, its Subscription and its Entitlements; the Organization's owner
then invites staff (blueprint 4.4). Neither application exists yet, so until they
do there is no way into this one by hand — which is what `pnpm db:seed:dev` is
for. It creates the account through this application's own sign-up route and lets
this application map the provider subject onto a Ranza user, then grants that user
a membership and two Properties. It refuses to run against anything but the local
database.

## Shape

```text
src/
  app/
    [locale]/                lang and dir are set here, so Arabic is RTL on first render
      sign-in/
      (workspace)/           the authenticated shell: navigation, Property switcher
        today/
    api/auth/[...all]/       Better Auth owns every route beneath this path
  server/
    composition.ts           the composition root — three clients, three roles
    viewer.ts                the only path from a request to tenant data
  messages.ts                tr, en and ar copy
```

## The two files that matter

**`composition.ts`** is the only place that reads the environment or opens a
connection, because modules receive their dependencies rather than discover them
([ADR 0006](../../docs/adr/0006-modules-take-dependencies-by-injection.md)). It
holds three clients for three roles — `ranza_app` for tenant queries,
`ranza_auth` for credentials, and deliberately _not_ `DIRECT_URL`, whose role
owns the tables and would therefore disable every policy. It refuses to start if
the two are the same. The hot-reload singleton lives here rather than in
`packages/db` because connection reuse is an application concern.

**`viewer.ts`** is the single funnel from a request to tenant data: session,
then provider subject to Ranza user, then a read inside a request context.
Missing any step denies rather than fails, which looks like an empty page rather
than a bug — so the steps are not separable, and nothing outside `src/server/`
may import `@ranza/db`, `@ranza/core` or `@ranza/auth`.
`.dependency-cruiser.cjs` enforces that and a fixture proves the rule fires. See
[ADR 0007](../../docs/adr/0007-a-session-becomes-a-request-context.md).

## Rules this application follows

- **No business rules here.** It composes module contracts, renders, and leaves
  authorization to the modules and the database.
- **Navigation shows only entitled capabilities** (blueprint 4.6). A capability
  the Organization has not bought is absent, not disabled — locked upsells
  belong to a separate Explore area. Hiding a control is never the boundary:
  the five gates deny regardless of what renders.
- **Three languages, written with the feature.** A missing string is a type
  error in `messages.ts`, not a silent fallback to English.

Access is verified against a real database by
[`tests/integration/workspace-access.test.ts`](../../tests/integration/workspace-access.test.ts).
