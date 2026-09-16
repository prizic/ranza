# 0019. A live screen uses TanStack Query, scoped to the tenant

Status: Accepted
Date: 2026-09-16

## Context

Every screen so far is a Server Component that reads through `src/server/`
(ADR 0007) and a server action that writes and revalidates. That is the right
default and this does not change it: the data is fetched on the server, under the
viewer's own context, and nothing about it exists in the browser.

Three screens in blueprint section 5 do not work that way. A housekeeping board
is open on a tablet for a whole shift while other people change it. An
arrivals and departures command center is the screen a front desk leaves up. A
room rack shows state that moves under the person looking at it. Each needs
polling, and the housekeeping board needs an optimistic update or every
"cleaned" tap costs a round trip before the tile moves.

`router.refresh()` on an interval is the framework-native answer and was tried
first in principle. It re-renders the whole route on the server, which is both
more work than the one list that changed and visibly worse: a refresh mid-scroll
on a long board is not a thing anybody wants on a tablet.

So a client cache, for those screens. The risk is not the library. The risk is
that a client cache is the first thing in this product that holds one tenant's
data in a place that outlives a request, and the failure mode is one
Organization's rows rendering under another's.

## Decision

### TanStack Query, in `apps/operator-workspace`, on live screens only

Not as the data layer. As a cache for screens that stay open and change
underneath the user, which is a short list and is expected to stay short.
Everything else remains Server Components and server actions, and a pull request
that reaches for `useQuery` on an ordinary page is answered with "make it a
server component".

The Guest Portal gets it when a Portal screen needs it, by its own decision.

### The cache key begins with the tenant, always

One factory per feature, and inline array keys in components are forbidden:

```ts
["ranza", userId, organizationId, propertyId, "front-office", "arrivals", date];
```

This is the whole of the decision. A key of `["arrivals", date]` is correct until
somebody switches Property, at which point the cache answers the new Property's
question with the old Property's rows — instantly, from memory, with no request
to the server that would have denied it. Row-level security never sees that
happen, because nothing happened.

The database is still the authorization boundary and this changes nothing about
it. What a scoped key prevents is a _presentation_ leak: the server would never
have returned those rows, and the cache returns them anyway because it was asked
a question it thought it had already answered.

`queryClient.clear()` on sign-out, Organization switch and Property switch,
before navigating, for the same reason and as the second line of it.

### A `QueryClient` is never shared across requests, and never module-level

On the client, created in `useState(() => new QueryClient(...))` inside a
`"use client"` provider mounted in the authenticated workspace layout — not the
root layout, so sign-in and public pages carry no tenant cache at all.

On the server, for prefetch and `dehydrate`, created _inside the request_. A
module-level `QueryClient` on the server is one object shared by every concurrent
request on that instance, which is one tenant's data dehydrated into another
tenant's HTML. This is the sharpest edge in the whole decision and it looks like
ordinary module-scope code.

### Reads go through route handlers into the same funnel

A client hook cannot call `src/server/` directly, so live screens get `GET` route
handlers under `src/app/api/`. Those handlers call `src/server/` functions and
nothing else — never a module, never Prisma, never `@ranza/db`. The funnel is
unchanged; it has gained one more entrance, and the entrance is narrow by rule
and by `.dependency-cruiser.cjs`.

Server actions are not used as a `queryFn`. They are a write mechanism; using one
as a read makes a POST out of every poll and defeats the cache's own semantics.

Writes stay as server actions, and invalidate the scoped key on success.

### Nothing is persisted, and refusals are indistinguishable

No `persistQueryClient`, no localStorage, no IndexedDB. Tenant data in a browser
should not survive the tab. Offline housekeeping is a real request and will need
its own decision, because "the tablet works in the basement" and "the tablet
holds a Property's guest list at rest" are the same feature.

401, 403 and not-found produce the same treatment in the UI: clear the relevant
queries, show the uniform message. The whole product answers "you may not" and
"it does not exist" identically, and a client cache is not where that stops.

Retries are for server errors only — never a 4xx, which is a refusal and will be
refused again. Mutations do not retry at all.

## Consequences

`apps/operator-workspace` gains a client-side dependency and a provider in the
authenticated layout. The bundle grows; the screens that justify it are the ones
a front desk stares at all day.

There are now two ways to read tenant data in the workspace — a Server Component
through `src/server/`, and a client hook through a route handler into
`src/server/`. Two ways is one more than one, and the boundary rules exist
because the second one is the one that can be used wrongly.

Polling is 30–60 seconds and pauses when the tab is hidden. Realtime — a
websocket, `LISTEN/NOTIFY` — is not adopted. When a screen genuinely needs
sub-second freshness that is a decision with an operational cost, not a
smaller interval.

Optimistic updates are limited to simple status changes: snapshot in `onMutate`,
roll back in `onError`, invalidate in `onSettled`. The server remains the
authority, and a tile that snapped to "cleaned" and snapped back is a better
failure than one that lied quietly.
