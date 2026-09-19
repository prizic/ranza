# 0027. The worker ends a session through one function and no grant

Date: 2026-09-17

Status: Accepted

## Context

Changing what a Staff Member may do has to end the sessions they already hold.
Otherwise a role cut at nine keeps working until the session lapses, and the
screen says one thing while the database says another — which is the gap the
whole of Staff and permissions exists to close.

[ADR 0005](0005-better-auth-with-provider-indirection.md) is in the
way, deliberately. `auth_user`, `auth_session`, `auth_account` and
`auth_verification` hold password hashes and session tokens; `ranza_auth`
reaches them and `ranza_app` is granted nothing. Row-level security is not used
there because authentication happens before any identity is known, so role
grants are the boundary — and that boundary is the reason a defect in a tenant
query cannot walk out with a session token.

`ranza_worker` is in the same position: granted nothing, on purpose.

Slices 1 to 3 shipped without crossing it. Every command that changes reach
publishes `staff.reach_changed` inside the transaction that changed it, so the
fact is durable and the gap was a missing handler rather than a lost event
([ADR 0017](0017-cross-module-facts-travel-through-a-transactional-outbox.md)).
This decides how that handler reaches across.

Three ways were available.

**Grant `ranza_worker` a narrow privilege on `auth_session`.** One `DELETE`,
scoped by nothing. It would work, and it would mean a process that runs
unattended holds a privilege on the credential tables — the property ADR 0005
bought, sold to make one feature convenient. It also does not work on its own:
`auth_session."userId"` is the authentication provider's subject, not a Ranza
user id, so the caller would need `public.auth_identities` as well, and a caller
that can read that mapping can enumerate subjects.

**Have the workspace end the session at the moment of the change.** It holds a
`ranza_auth` client already. But the command runs in one transaction and the
sign-out would be on another connection, so a crash between them leaves somebody
signed in with nothing recording that it is owed — which is precisely what the
outbox exists to prevent, and this repository has an ADR saying so.

**One security-definer function, and no table grant.**

## Decision

`app.end_sessions_for(uuid)` is `SECURITY DEFINER` with `search_path = ''`, and
`EXECUTE` on it is granted to `ranza_worker` and to nobody else. No grant on any
`auth_*` table is added to any role.

The function takes a Ranza user id, resolves it through `public.auth_identities`
and removes every session those subjects hold. That is the whole of its surface.
`ranza_worker` cannot read a token, list a Staff Member's sessions, ask whether
somebody is signed in, or create anything — the only sentence it can say is "end
every session this Ranza user holds", and it cannot observe the answer beyond a
count.

Sessions are removed rather than expired in place. Better Auth removes a session
on sign-out, so the row is not a record anything relies on, and expiring instead
would leave a table that only ever grows. Why it happened is in `audit.records`,
written by the staff module in the transaction that changed the reach.

## Consequences

ADR 0005 is unchanged, not amended. The boundary it drew still holds in the form
it was drawn in: no application role holds a privilege on a credential table.
What is new is a single named capability that crosses it — a thing a person can
read in one place and reason about, rather than a grant somebody has to go
looking for.

`tests/integration/staff.test.ts` asserts both halves: that a reach change ends
every session the Staff Member holds on every device and leaves everybody else
alone, and that `ranza_worker` still cannot select from or update
`public.auth_session` at all. The second is what makes the first worth anything
— without it the function would be a convenience rather than a boundary. Both
were watched go red, by stubbing the function to end nothing and by granting the
worker `SELECT` on the table.

The pattern generalizes and should be reused rather than widened. A second
capability that needs the credential tables gets a second function and a second
grant, not an addition to this one; the value here is that the surface is
enumerable.

`staff.reach_changed` is the product's first real outbox handler, so the lease,
the idempotency and the retry schedule stop being proved only against a handler
that exists inside a test file.
