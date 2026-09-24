# 0028. An Organization-wide read is gated through the Property it is opened from

Status: Accepted
Date: 2026-09-20
Amended: 2026-09-23 by [ADR 0031](0031-an-audit-record-carries-its-location-and-is-read-by-permission.md). The shape this ADR fixes stands — a gated Ranza caller, a `…Within` read across the platform contract, one transaction — but what the audit log is gated on does not. The gate is now the `audit.read` permission and the Property's reach, with no commercial gate: audit is a baseline right (blueprint 3.6), so the `app.can_use_capability(…, 'audit')` statement below and the `property_capabilities` row it needed are gone. Reach is no longer Organization-wide either: a record carries a location, and the read policy narrows to the Properties the reader reaches. The paragraph about `users_read_self` was already wrong when written — `20260916002200` had replaced it with `users_read_self_and_colleagues` — and the log now names colleagues.

## Context

The audit log is the first screen to read a platform module. `audit.records`
carries the scope a record was written in, and that scope is an Organization:
there is no `property_id`, because the module that owns the table may not know
what a Property is (blueprint 9.8, enforced by `scripts/dependency-boundaries.mjs`).
So the read is Organization-wide by the shape of the data.

Every other read in the Operator Workspace is bounded by blueprint 3.5's
commercial gates **inside its own query**: `@ranza/folios` and `@ranza/core`
call `app.can_use_capability(property.id, module, capability)` in the `SELECT`
([ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md) — "an
application check is not a boundary"). That function takes a Property, because
gate 3 is a Property capability. An Organization-wide read has no Property to
hand it, and the platform module that runs the read cannot name one.

Three shapes were on the table:

1. **A gate in the host.** `viewer.ts` asks `entitledProperties(AUDIT_CAPABILITY)`
   and refuses an Organization that read did not return. The gate is a real
   database query, but the correlation to the read is an `if` in application
   code, in a different transaction, and the composition would then hold a
   module method that reads a scope with no gate on it at all.
2. **The join from `@ranza/core`.** Put the gate and the read in one statement
   by joining `audit.records` from the Ranza tier. Forbidden by
   [ADR 0008](0008-a-module-owns-a-schema-not-a-migration-history.md): a
   module-owned schema is reached only through the module's contract.
3. **The gate in the Ranza tier, the read across the contract, one
   transaction.** The shape every writer already has: `@ranza/reservations`
   opens a transaction, decides what it may do against Ranza tables, and hands
   that transaction to `recordWithin(tx, …)`.

## Decision

The third. A read of a platform module's scope is performed by a Ranza module
that resolves the scope through the commercial gate in its own transaction and
then calls the platform module's `…Within(tx, scope, …)` contract with that
same transaction. For the audit log that is `@ranza/core`'s `recentActivity`:

```
select organization_id from public.properties
where id = $property and app.can_use_capability($property, 'platform_core', 'audit')
```

then `recentWithin(tx, organizationId, limit)`. No row from the first
statement means an empty history, indistinguishable from a Property that does
not exist.

The platform module exposes **only** the `Within` form of a scope read. There
is no `recent(actorId, organizationId)` on the module object, and there must
not be one: the module knows a scope as an opaque identifier and cannot say
what it is entitled to, so a method taking an actor and a scope would be a
second path to the same rows with no gate on it. `historyOf`, the per-subject
read, predates this decision and is bounded by row-level security alone; it is
not called from the Workspace.

The Property the viewer opened the screen from is what the gate is asked about,
which is also what makes the Property switcher meaningful on an
Organization-wide screen: it chooses which Property's wall clock the times are
shown in, and which Property's capability decides whether the log opens at all.

## Consequences

- The funnel rule in `.dependency-cruiser.cjs` now covers `packages/platform/`
  as well as the Ranza tier, with a fixture proving it fires. A feature folder
  importing `@ranza/platform-audit` at runtime is a build failure, as it always
  should have been.
- `@ranza/core` depends on `@ranza/platform-audit`. That is the allowed
  direction (`ranza → platform`) and the one reservations and folios already
  use.
- The next platform module the Workspace reads — inventory, notifications —
  copies this shape rather than inventing one: a `…Within` read on the platform
  side, a gated caller on the Ranza side, one transaction.
- Reach is still Organization-wide once the gate passes, because the policy on
  `audit.records` is membership-wide and a record carries no Property. A Staff
  Member assigned to one Property reads every Property's records. That is what
  the data allows today and it is pinned by
  `a_staff_member_assigned_to_one_property_reads_the_organization` in
  `tests/integration/audit-log.test.ts`, so narrowing it later is a deliberate
  change with a column and a migration behind it, not a side effect.
- Naming the actor is not part of this. `public.users` is readable only by its
  own row (`users_read_self`), so the screen shows a stable id and "you". A
  co-member lookup is a migration and its own decision.
- Turning the log on for an Organization is a `property_capabilities` row per
  Property with `capability_key = 'audit'`. `scripts/db-seed-dev.mjs` writes it
  locally; a hosted database has no such row until somebody inserts one, and
  there is no Control Plane surface for that yet. Until then the destination is
  absent from the rail there, which is the honest state rather than a defect.
- The permission gate that [ADR 0026](0026-a-role-is-a-named-set-of-permissions-and-reach-is-taken-away-for-free.md)
  put in front of every write is not in front of this read, because no read
  carries one: reads are bounded by capability and reach, as every list in the
  Workspace is. Whether opening the log should need a permission of its own is a
  catalogue row, and a catalogue row is a migration — recorded as `AL-DEF-02`.
