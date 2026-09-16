# 0005. Better Auth now, behind provider indirection

Status: Accepted
Date: 2026-09-16

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

Better Auth generates text ids by default while Ranza uses `uuid`. Confirm
against current Better Auth documentation during implementation and either
configure UUID generation or type the `auth_identities.subject` column as text.
