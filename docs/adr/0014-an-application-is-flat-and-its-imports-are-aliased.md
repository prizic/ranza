# 0014. An application is flat, and its imports are aliased

Status: Accepted
Date: 2026-09-16
Applied: not yet — see Migration

## Context

Both applications keep their code under `src/`, and every route is
locale-prefixed and inside a route group. So the shallowest real page is

```text
apps/operator-workspace/src/app/[locale]/(workspace)/arrivals/page.tsx
```

which is four directories below `src/`. Everything it needs — the server funnel,
the message catalogue, its own feature components — is at or near the top, so it
reaches them by climbing:

```ts
import { messages } from "../../../../messages";
import { arrivals } from "../../../../server/viewer";
import { ArrivalsTable } from "../../../../features/front-office/components/arrivals-table";
```

Across 36 files there are 45 relative imports. **Forty of them climb three or
four levels.** None of the applications defines a `paths` alias; the only one in
the repository is in `packages/ui`, added so the shadcn CLI could resolve `@/`.

Two separate problems are being paid for at once. `src/` is a directory that
holds one thing and means nothing — Next has not required it since the App
Router, and it adds a level to every path in the tree. And the climb itself is
unreadable: `../../../../` says nothing about where it lands, breaks the moment
a route is nested one deeper, and makes a file impossible to move without
rewriting its imports.

## Decision

**Applications have no `src/`.** `app/`, `features/`, `lib/`, `server/` and
`messages.ts` sit at the application root, which is Next's own default.

**Applications import through `@/`.** Each application's `tsconfig.json` gets

```json
{ "compilerOptions": { "paths": { "@/*": ["./*"] } } }
```

and the imports above become `@/messages`, `@/server/viewer`,
`@/features/front-office/components/arrivals-table`. A reader sees where a thing
lives; a file can move without its imports changing.

This applies to applications only. `packages/*` keeps relative imports inside a
module, deliberately: an application compiles a workspace package's source with
its **own** resolution, so a `@/` written inside `packages/ui` does not resolve
there. That is not a style difference, it is the reason the shadcn components
had to be rewritten to relative paths twice.

## Consequences

The path-based enforcement moves with the tree, and this is the part to get
right. `.dependency-cruiser.cjs` keys ADR 0007's funnel rule on

```js
from: { path: "^apps/[^/]+/src/", pathNot: "^apps/[^/]+/src/server/" }
```

and `scripts/dependency-boundaries.mjs` proves it fires using fixtures at
`apps/operator-workspace/src/app/page.ts`. Move the tree without updating both
and the rule matches nothing — it passes, permanently, while enforcing nothing.
That is the same shape as the three green-but-inert tests this repository has
already had, so the migration is not done until the fixtures have been watched
going red again.

Also moving: `next.config.ts` needs no change, but `tsconfig.json` `include`,
the `@source` in each application's `globals.css`, and the `src/` mentions in
both application READMEs do.

## Migration

**Not applied yet.** Recorded now so the shape is agreed before more screens are
added, because every new route deepens the climb it describes.

It is two independent changes and the second is the cheap, useful half:

1. Add `paths` and rewrite the 45 imports. No files move; the enforcement rules
   are untouched. This alone removes every `../../../../`.
2. Lift each application out of `src/`, and update the dependency-cruiser rule,
   the boundary fixtures, `tsconfig.json`, `globals.css` and the READMEs with it.

Doing (1) first is worth it: it is reversible, it touches no guard, and it makes
(2) a pure move rather than a move plus a rewrite.
