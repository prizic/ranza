# @ranza/core

Organization, Property, membership and Entitlement reads — the foundation
blueprint section 5.1 calls Platform Core. It sits in the Ranza tier, not the
reusable one, because Organization and Property are Ranza concepts
([ADR 0003](../../../docs/adr/0003-organization-and-property-belong-to-ranza-core.md)).

## Contract

```ts
const core = createCoreModule({ db }); // db: the ranza_app client (ADR 0006)
await core.listEntitledProperties(userId, TODAY_CAPABILITY);
await core.listPermittedProperties(userId, AUDIT_READ_PERMISSION);
await core.auditLog(userId, propertyId, filters); // one page, and its names
await core.auditRecord(userId, propertyId, recordId); // one record, by id
```

`auditLog` is the audit log opened from a Property. The audit module knows a
scope only as an opaque id and may not name a Property (blueprint 9.8), so this
module asks, in its own transaction, whether the viewer reaches that Property
and holds `audit.read` in its Organization, then hands the Organization across
the audit module's `recentWithin` contract
([ADR 0028](../../../docs/adr/0028-an-organization-wide-read-is-gated-through-the-property-it-is-opened-from.md)).
No commercial gate: audit is a baseline right (blueprint 3.6,
[ADR 0031](../../../docs/adr/0031-an-audit-record-carries-its-location-and-is-read-by-permission.md)).
Which records come back is the read policy's decision.

Everything Ranza-specific about the log lives in `src/audit-log.ts`: turning a
day range into instants in the Property's clock, turning free text into the
Guests, rooms and colleagues it could mean, and naming every id on a page —
read at read time, bounded by the policies, never copied into a record.

`listEntitledProperties` is one SQL statement so that all five gates of
blueprint 3.5 apply to it at once and each can deny alone: rows are filtered by
row-level security before `app.can_use_capability()` re-checks Subscription,
Entitlement, Property capability and Staff reach. The module contains no
authorization logic of its own — see
[`prisma/migrations`](../../../prisma/migrations) for where those gates live.

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
[`tests/integration/workspace-access.test.ts`](../../../tests/integration/workspace-access.test.ts)
and [`tests/integration/audit-log.test.ts`](../../../tests/integration/audit-log.test.ts).
