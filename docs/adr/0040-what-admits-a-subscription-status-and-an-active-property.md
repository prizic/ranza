# 0040. What admits: a Subscription status, and an active Property

Date: 2026-09-29

Status: Accepted — applied in `20260916009700_past_due_is_a_grace_period`

Builds on [ADR 0007](0007-a-session-becomes-a-request-context.md),
[ADR 0009](0009-a-resident-reaches-their-own-stay-not-an-organization.md) and
[ADR 0018](0018-the-worker-has-its-own-role-and-its-own-context.md).

## Context

Blueprint 3.5's first gate asks for "an active Subscription" and says no more.
`subscriptions.status` has five values — `trialing`, `active`, `past_due`,
`suspended`, `cancelled` — and until now `app.capability_is_available()`
admitted the first two. No ADR said so, and no test asserted `trialing` at all.

That made `past_due` a lockout. The moment a card failed, every front desk in
the Organization lost its in-house Guests mid-shift, for a billing event nobody
at the desk can act on. A property management system does not behave like
that.

Separately, `app.accessible_property_ids()` has admitted only `active`
Properties since the first migration, so an archived Property left everybody's
reach — but nothing but the code said so (OA-S1-16).

## Decision

### Which Subscription statuses admit

| status      | gate 1                    |
| ----------- | ------------------------- |
| `trialing`  | admits                    |
| `active`    | admits                    |
| `past_due`  | admits — the grace period |
| `suspended` | denies                    |
| `cancelled` | denies                    |

**`past_due` is the grace period.** It lasts as long as the Subscription stays
`past_due`, and the Control Plane — not the gate — ends it by moving the
Subscription to `suspended`. How long that takes is a billing decision, made
where billing is decided; changing it never needs a migration.

While it lasts, the Workspace shows each **Owner** of the Organization a billing
notice naming it (`billingNotices` in `@ranza/core`). Owner means an active
membership naming the shipped `owner` role. Nobody else sees it: a manager or a
front desk can do nothing about a card, and a notice they cannot act on is
noise. The notice blocks nothing.

The rule lives in one statement, `app.capability_is_available()`, so it is the
same answer everywhere that statement is asked:

- **Staff**, through `app.can_use_capability()`.
- **Residents**, through `app.resident_can_use_capability()`.
- **The worker.** Its close of a quiet business day, room-night posting and the
  housekeeping and maintenance writers ask the three-gate helper directly, so a
  `past_due` Organization's days keep closing and its nights keep being posted.
  That is intended: the grace period is a period in which the hotel runs.

Each status is asserted by name in
`tests/database/organization_property_foundation.test.sql`, and the fixtures
that meant "a lapsed Subscription" use `suspended`, never `past_due`.

### An archived Property is out of everybody's reach

`app.accessible_property_ids()` admits only `properties.status = 'active'`. An
archived Property is therefore out of the operational reach of every Staff
Member — an `organization_wide` Owner included — for reads and writes alike:
the Property, its bookings, its Stays, and every capability there. The audit log
keeps naming it ([ADR 0031](0031-an-audit-record-carries-its-location-and-is-read-by-permission.md)), which is history rather than reach.

## Consequences

- An Organization that is `past_due` on the day this deploys gets its access
  back. On hosted staging there were none (preflight, 2026-09-29).
- A test that wants "lapsed" must say `suspended`. Using `past_due` now asserts
  the opposite of what it names.
- Once reporting exists, a closed Property's financial history will need a
  read-only path for the Owner. That is a new decision when it comes, not a
  widening of `accessible_property_ids()`.
