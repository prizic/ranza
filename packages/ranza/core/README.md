# @ranza/core

Organization, Property, membership and Entitlement reads — the foundation
blueprint section 5.1 calls Platform Core. It sits in the Ranza tier, not the
reusable one, because Organization and Property are Ranza concepts
([ADR 0003](../../../docs/adr/0003-organization-and-property-belong-to-ranza-core.md)).

## Contract

```ts
const core = createCoreModule({ db }); // db: the ranza_app client (ADR 0006)
await core.listEntitledProperties(userId, TODAY_CAPABILITY);
await core.listEntitledPropertiesByCapability(userId, [a, b, c]); // one answer each, in order
await core.recentActivity(userId, propertyId); // { records, total }
```

`recentActivity` is the Organization's audit log, read through one of its
Properties: the audit module knows a scope only as an opaque id and may not name
a Property (blueprint 9.8), so this module asks `app.can_use_capability()` about
the Property in its own transaction and hands the Organization it resolves to
across the audit module's `recentWithin` contract
([ADR 0028](../../../docs/adr/0028-an-organization-wide-read-is-gated-through-the-property-it-is-opened-from.md)).

`listEntitledProperties` is one SQL statement so that all five gates of
blueprint 3.5 apply to it at once and each can deny alone: rows are filtered by
row-level security before `app.can_use_capability()` re-checks Subscription,
Entitlement, Property capability and Staff reach. The module contains no
authorization logic of its own — see
[`prisma/migrations`](../../../prisma/migrations) for where those gates live.

`listEntitledPropertiesByCapability` is the same statement over an `unnest` of
the requested (module, capability) pairs, for a caller that needs several
answers at once — the workspace shell, which asks about every destination. One
transaction rather than one per capability; each answer is exactly what
`listEntitledProperties` gives for that capability alone, which the integration
test asserts for every viewer in its fixture.

An empty array means "this viewer may use nothing here". It is never an error,
which is also why the request context is not optional: without one the policies
see a null acting user and deny, and the page would look merely empty. The host
funnels every read through `apps/operator-workspace/src/server/viewer.ts` for
exactly that reason ([ADR 0007](../../../docs/adr/0007-a-session-becomes-a-request-context.md)).

## Rules

- Receives its client; never constructs one and never reads `process.env`.
- Only `index.ts` is importable.
- Callers pass a Ranza user id, never a provider subject. The mapping is the
  auth module's job ([ADR 0005](../../../docs/adr/0005-better-auth-with-provider-indirection.md)).

Verified against a real database by
[`tests/integration/workspace-access.test.ts`](../../../tests/integration/workspace-access.test.ts).
