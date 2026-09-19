# 0026. A role is a named set of permissions, and reach is taken away for free

Date: 2026-09-17

Status: Accepted

## Context

Staff and permissions is the first feature whose subject is authorization
itself. Blueprint 7.2 says an Organization's staff hold roles and that roles
carry permissions; it does not say whether a role is a label the product
interprets or a set the Organization composes, and the difference decides the
schema.

Three questions came out of the design grill and were answered before any of it
was written. They are recorded here because the code now assumes all three and
none of them is visible from reading one table.

### What a role is

A label is cheaper. It is also a lie that gets more expensive every release: the
moment anybody wants a Night manager who can check people in but not refund
them, a label has to become a set, and every membership written against the old
meaning has to be interpreted.

So a role **is** the set. Adding a permission to somebody does not modify their
role, it is a new role and a new role is named — which is what makes
"who can do this?" answerable by reading one row rather than by reading the
application.

### Whose roles they are

Ranza ships a fixed set every Organization shares — Owner, Manager, Front desk,
Housekeeping, Finance. An Organization may author its own. Neither may see the
other's: a shipped role is the common reference and an authored one is private.

A shipped role has no Organization, and a nullable column cannot carry a foreign
key. `staff_roles` therefore stores the same fact twice: `organization_id`, which
is the truth and is null for a shipped role, and `scope_id`, which is that
Organization or the nil uuid. A check keeps them in step and the composite key is
built on `scope_id`, so a membership naming another Organization's role is
refused by a foreign key rather than by a query somebody has to remember to write.

### When money may say no

Blueprint 3.5's gates run in front of every write. Applying them uniformly here
would mean an Organization whose invoice is overdue cannot revoke a compromised
account — which converts a billing problem into a security incident, and does it
at exactly the moment somebody is trying to contain one.

So the gates apply to **giving** reach and never to **taking it away**: invite,
assign, change a role, define and edit are gated; revoke, unassign and retire are
not. Undoing a revoke is giving reach back, so it is gated like the rest.

This is expressed inside the existing write policies rather than beside them. A
policy cannot see the row it is replacing, and it does not need to: the condition
is on the resulting status, so a row that ends up `revoked` skips the commercial
gate and a row that ends up `active` does not.

## Decision

1. A role is a named set of permissions. `staff_roles.permissions` is that set
   from the first migration, not a later upgrade.
2. Roles Ranza ships have no Organization and are shared, immutable and never
   retired. An Organization's own roles are scoped to it by a composite key, so
   crossing that boundary is unrepresentable.
3. Blueprint 3.5's commercial gates bound commands that grant reach. Commands
   that remove it carry the reach and permission gates alone.

## Consequences

An Organization always keeps somebody who can add staff. That is a fact about a
set of rows rather than about the row being written, so it is a trigger that
locks the Organization's memberships rather than a policy — and the lock is the
point, because two administrators demoting each other at once would otherwise
each find the other still standing. `tests/integration/staff.test.ts` runs that
race on two connections.

A permission is a string in an array and nothing yet constrains which strings.
That is slice 2's catalogue, and until it exists `staff.administer` is the only
permission anything asks about. The array is what the catalogue will constrain;
it is not thrown away.

Staff administration is an Organization-wide command in a product whose gates are
asked about a Property, so it goes through
`app.can_use_capability_in_organization()` — which means an Organization with no
Property has nobody who can invite. Creating the first Property is onboarding,
which is unbuilt, and this is named rather than worked around.

Reversing this would mean rewriting every membership row and every write policy
that consults one. It is the kind of decision that is cheap now and not later,
which is why it was made before the first table.
