# 0009. A Resident reaches their own Stay, not an Organization

Status: Accepted
Date: 2026-09-16

## Context

Every row-level security policy written before the Stay grants access the same
way: the reader is looked up in `organization_memberships`, and where the record
is Property-scoped, in `property_assignments` as well. `app.current_user_id()`
identifies a Staff Member, and `app.accessible_property_ids()` turns that into a
set of Properties.

A Guest or Resident has neither row and never will. Giving one a membership to
make the Portal work would make them a Staff Member of the Organization — with
whatever reach the role implies, appearing in Staff lists, counted against Staff
seats (blueprint 3.4), and reachable by any future policy that trusts membership
to mean "works here". Blueprint 4.3 says the Portal must never expose staff
controls; a membership would make that a matter of what the interface happens to
render.

They authenticate identically. Better Auth issues the session, `auth_identities`
maps the provider subject to a Ranza user, and `app.current_user_id()` returns
the same kind of id ([ADR 0005](0005-better-auth-with-provider-indirection.md)).
Authentication is shared. Authorization is not, and the temptation is to reuse
the authorization too, because the identity already lines up.

This is the first second reader in the system. Whatever shape it takes, every
module that later adds a Portal capability — Guest and Resident Services,
Folios, announcements — will copy it.

## Decision

A Resident's reach is derived from their own Stay, through separate policies and
a separate gate function. The Staff policies are never widened to admit them.

Concretely:

- `stays_read_own` grants `user_id = app.current_user_id()`. It sits beside
  `stays_read_accessible_property`, which is the Staff policy, rather than
  replacing or relaxing it.
- `app.resident_stay_property_ids()` and
  `app.resident_stay_accommodation_unit_ids()` are the Resident's equivalent of
  `app.accessible_property_ids()`. Only a **current** Stay — `reserved` or
  `in_house` — grants reach. A departed Resident keeps their own Stay record and
  stops reaching the Property around it.
- `app.resident_can_use_capability()` answers blueprint 3.5 for the Portal. It
  is a sibling of `app.can_use_capability()`, not a branch inside it.
- Gates 1 to 3 — Subscription, Entitlement, Property capability — are extracted
  into `app.capability_is_available()` and shared by both. Only gate 4, who is
  asking, differs.
- Nothing is added for `organizations`, `organization_memberships`,
  `property_assignments`, `subscriptions` or `entitlements`. A Resident reads
  none of them. The commercial gates are answered on their behalf by a
  security-definer function, which needs no grant.

The two paths are siblings, and the reason is narrower than symmetry: a single
function with a branch for each reader is how a widening made to help one of
them silently reaches the other. Splitting them means a change to Staff reach
cannot alter the Portal, and the reverse, without someone editing the other
path on purpose.

## Consequences

A Portal capability is now built by adding a policy keyed on the Stay and a
check in `app.resident_can_use_capability()`. It is never built by granting a
Resident a role.

The duplication is real: two gate functions, and a Property-scoped table that
both readers need now needs two policies. Gates 1 to 3 being shared bounds it —
the commercial state of an Organization cannot diverge between the Workspace and
the Portal, because it is one statement. What is duplicated is only the question
of who is asking, which is exactly the part that must not be shared.

`user_id` on `stays` is nullable, because most Stays are created by Staff for
someone who has never signed in. A Stay with no user has no Portal, which is a
normal state. It also fails closed twice over: a null `user_id` never matches,
and neither does a null acting user.

What a Resident may not reach is indistinguishable from what does not exist. No
Stay, a departed Stay, a revoked Entitlement and a Property that never enabled
the capability all produce an empty result, and the Portal renders the same
empty state for all four. This is deliberate, and it means Portal bugs cannot be
diagnosed from the interface alone — the database tests are where the four cases
are told apart.

Verified by `tests/database/resident_access_path.test.sql` and
`tests/integration/portal-access.test.ts`. Both were checked by breaking the
boundary: widening `stays_read_own` to `using (true)`, dropping the Stay check
from `app.resident_can_use_capability()`, opening `entitlements` to every
reader, and — the failure this decision exists to prevent — letting
`app.resident_can_use_capability()` also accept Staff reach. Each turns the
suites red on exactly the assertions that name it.
