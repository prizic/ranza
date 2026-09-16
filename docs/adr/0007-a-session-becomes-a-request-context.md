# 0007. A session becomes a request context in one place

Status: Accepted
Date: 2026-09-16

## Context

Three things have to happen before the application may read a tenant-owned row:

1. the session is validated, through the `ranza_auth` connection;
2. the provider subject is mapped to a Ranza user id, because
   `app.current_user_id()` returns Ranza's id and never a provider's
   ([ADR 0005](0005-better-auth-with-provider-indirection.md));
3. the read runs inside `withOrganizationContext()`, which publishes that id
   transaction-locally before the query
   ([ADR 0001](0001-prisma-owns-schema-sql-owns-rls.md)).

Skipping any one of them produces the same outcome, and it is the dangerous
kind. Nothing raises. The policies see a null acting user, deny every row, and
the page renders empty — which reads as missing data, not as a missing security
step. It would be diagnosed as a seeding problem, in a different part of the
system, by someone who did not write the query.

The reverse mistake is worse and just as quiet: a read that runs outside a
context in a code path that happens to hold privileged access sees everything.

Both failures come from the same source — the three steps being separable.

## Decision

They are not separable. One function in each application performs all three, and
nothing else may reach the database.

In `apps/operator-workspace` that function is `src/server/viewer.ts`. It
validates the session, maps the subject to a Ranza user, and calls a module
whose reads open the request context themselves. Step 3 lives inside
`@ranza/core` rather than in the host, so a caller cannot forget it; the host
cannot even express a read that skips it.

Two supporting rules make this structural rather than customary:

- `.dependency-cruiser.cjs` forbids anything outside `src/server/` from
  importing `@ranza/db`, `@ranza/core` or `@ranza/auth`, with a fixture in
  `tests/boundaries/fixtures` proving the rule fires.
- The viewer resolves the session by reading request headers **before** it
  touches the composition root, which is what marks every page beneath it as
  request-scoped. A page that could be prerendered would otherwise be built
  with no session at all and cached that way.

A missing or unmapped session yields no viewer, and no viewer yields an empty
result rather than an error. What a viewer may not reach is deliberately
indistinguishable from what does not exist.

## Consequences

Adding a page costs nothing: it calls the viewer helper and renders. Adding a
new kind of read means adding a contract to a module, not a query to a route —
which is the constraint that keeps business rules out of the application.

The cost is one indirection on every tenant read, and the discipline of
extending `viewer.ts` rather than reaching around it. The boundary rule makes
reaching around it a build failure, which is the only form of discipline that
survives a deadline.

This applies per application. `guest-portal` and `control-plane` will each need
their own funnel, and `control-plane` must not reuse this one: Prizic Control
Plane permissions and Organization staff permissions are separate systems
(blueprint section 14).

Verified by `tests/integration/workspace-access.test.ts`, which removes each of
the five gates in turn and confirms the read goes empty — and which was itself
checked by deleting the gates from the query and confirming the test goes red.
