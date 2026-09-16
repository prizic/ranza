# 0005. Better Auth now, behind provider indirection

Status: Accepted
Date: 2026-09-16
Amended: 2026-09-16 — implemented and verified; open question resolved.

## Context

Removing Supabase (ADR 0002) removed GoTrue, which had supplied sessions,
invitations, recovery, and MFA. The pilot showed this is not incidental work:
two of its last issues were entirely about hardening the invitation flow.

Keycloak was evaluated seriously. It would cover SSO, SAML, passkeys, and
central identity administration across all four applications, and it is
self-hosted, which suits the decision to avoid vendor dependence.

It was rejected for now on the blueprint's own terms. Section 14 lists adding
microservices without demonstrated operational need as a non-goal, and section
9.1 defers extraction until scale or deployment requirements justify the
operational cost. Keycloak is a separate stateful service with its own database,
upgrade path, and realm configuration that drifts across environments unless
managed as code. It would be introduced in Phase 1 to serve SSO, which section
3.6 sells in the Enterprise package. No customer requires SAML or SSO today.

The real argument for choosing it early is switching cost: password hashes are
rarely portable and MFA enrolments do not transfer.

## Decision

Better Auth provides authentication. It is self-hosted, stores its tables in this
PostgreSQL database, and has a Prisma adapter, so it adds no service to operate.

Provider choice is made reversible rather than permanent. Ranza owns its own
`users` table as canonical identity. Providers map onto it through
`auth_identities`, keyed by `(issuer, subject)` — never by email, which changes.

`app.current_user_id()` returns the Ranza user id, not a provider subject. The
server resolves subject to user at session validation and publishes only the
Ranza id. No policy, table, or query knows which provider authenticated anyone.

## Consequences

Adopting Keycloak later means registering another issuer, not rewriting auth.
Both can run at once: Better Auth for ordinary tenants, OIDC for enterprise
customers who require SSO. Users would still re-enrol MFA, but no business data
moves.

The cost is one extra table and a mapping step on every sign-in. That is the
price of keeping a hard-to-reverse decision reversible, and is paid knowingly.

Revisit when an enterprise customer makes SSO or SAML a condition of sale, or
when genuine cross-application single sign-on is needed.

The id-format question this ADR left open turned out to be moot. Better Auth
owns its own tables and Ranza maps provider subjects through
`auth_identities.subject`, typed `text`, so the two id formats never need to
match. The indirection removed the problem rather than solving it.

## Implementation notes

Better Auth's default table is named `user`, one character from Ranza's `users`
and meaning something different: `users` is what policies resolve against,
`auth_user` is a credential record. Its four tables are therefore prefixed
`auth_`.

They are reached through a **separate database role**. `auth_user`,
`auth_session`, `auth_account` and `auth_verification` hold password hashes and
session tokens. Row-level security exists because application defects happen, so
a defect in the tenant query path must not also expose every credential in the
system. `ranza_auth` holds the grants; `ranza_app` is granted nothing there, and
an integration test asserts the permission denial rather than trusting the grant.

RLS is deliberately **not** applied to those four tables. Authentication happens
before any user identity is known, so there is no context to filter on; role
grants are the boundary instead. Tenant isolation is unaffected because nothing
there is tenant-owned.

`users` and `auth_identities` do carry RLS, so sign-up needs policies scoped
`to ranza_auth` — grants alone are denied under `FORCE ROW LEVEL SECURITY`.
Those policies widen nothing for `ranza_app`, and `ranza_auth` holds no grant on
any tenant-owned table, so reading every identity row still reveals no
Organization's data.

Verified end to end by `tests/integration/auth-flow.test.ts`: sign-up, session,
subject-to-user mapping, idempotency on repeat sign-in, no rows before a
membership exists, exactly one Organization after, and credential access denied
to the tenant role.
