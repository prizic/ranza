# 0010. A second factor belongs to the person, not the Organization

Status: Accepted
Date: 2026-09-16
Amended: 2026-09-16

## Context

Blueprint section 13 lists MFA under Phase 1 identity and section 7.6 makes it
part of the security baseline. Neither says who decides that an account must
have one, and there are two coherent readings:

- each person turns it on for themselves; or
- an Organization requires it of its Staff, as a Feature Configuration or an
  Entitlement, and the product enforces that.

The question could not be deferred, because it decides where the record lives.
Under the first reading a second factor sits beside the password, in the
credential tables. Under the second it is tenant-owned — it would belong to a
membership, carry an `organization_id`, and be subject to row-level security
like everything else an Organization owns.

Identity is already shared across applications (ADR 0005): one Better Auth
instance, one `auth_user`, two hosts. A Staff Member and a Resident are the same
kind of account and differ only in what they reach (ADR 0009).

## Decision

A second factor is a property of the account, not of a membership.

It lives in `auth_two_factor` beside the password hash, reached only by
`ranza_auth`, with the tenant query path granted nothing — the same boundary,
because it is the same kind of secret. It carries no `organization_id` and no
row-level security, for the same reason the other `auth_` tables do not:
authentication happens before any identity is known.

Three consequences follow directly and were chosen, not inherited:

- **One enrolment covers every application.** A person who enrols in the
  Workspace is challenged in the Portal too. That is why `guest-portal` answers
  the challenge despite having no enrolment screen — without it, a Staff Member
  signing in there would meet a form that succeeds and returns no session.
- **Enrolment lives in the Workspace only.** A Guest or Resident has no account
  settings surface yet, and inventing one to hold a single toggle would be a
  screen built ahead of the workflow that needs it.
- **Nothing can require it.** See the amendment below: this was justified with
  a claim about the blueprint that is not true.

Enrolment is two steps: Better Auth writes the secret with `verified = false`
and leaves `twoFactorEnabled` alone until a code proves the authenticator app
really holds it. Someone who closes the page halfway can still sign in. This is
the default and it is kept deliberately — the alternative turns a mis-scanned
key into a lost account.

## Consequences

An Organization cannot mandate MFA today. When it is wanted, that is a Feature
Configuration at Organization scope plus a check where the session becomes a
viewer — not a change to where the secret lives. This ADR is what makes that a
small change rather than a migration.

Backup codes are shown once, at enrolment, and each works once. Losing both the
authenticator and the codes therefore needs an operator-assisted reset, and
**there is no such path yet**. It belongs in the Control Plane, with strong
authentication, a reason and an immutable audit record (blueprint 4.4) — the
same treatment every other high-risk support action gets. Until it exists, a
locked-out account is recovered by a database operation, which is exactly the
kind of thing that should not stay true for long.

Verified by `tests/integration/two-factor.test.ts` and
`tests/database/two_factor_credentials.test.sql`. Both were checked by breaking
the boundary: enabling on enrolment rather than on verification, granting
`ranza_app` read on the secret, defaulting `twoFactorEnabled` to true, and
removing the foreign key so a deleted account leaves its credential behind.

## Amendment, 2026-09-16

Two things in the decision above are wrong, both found by reviewing it rather
than by anything failing.

**Blueprint 7.6 does mandate MFA.** Its security baseline reads "secure
authentication, strong session management, **MFA for privileged roles**, least
privilege, encryption in transit and at rest, **rate limiting**, …". The
decision said no approved specification described a mandate and built opt-in
only. The shape of the decision still stands — a second factor belongs to the
person, and enforcement is a check where the session becomes a viewer rather
than a change to where the secret lives — but "nothing requires it" is now a
**known gap against an approved specification**, not a deliberate absence of
one. Whoever implements it should start from which roles count as privileged:
`owner` at minimum, and every Prizic Control Plane account.

**The account lockout does not engage.** The decision implied the plugin's
`failedVerificationCount` and `lockedUntil` columns defend a guessed code. They
do not, in this flow: the challenge is exhausted after five wrong codes and its
cookie invalidated, so the counter never climbs and both columns stay at their
defaults. The defence that does hold is that per-challenge cap, plus the cost of
producing the password again for a new challenge. This is asserted now in
`tests/integration/two-factor.test.ts`, which is what corrected the claim.

That second point has a consequence worth naming: with the cap at five and a
new challenge costing one rate-limited sign-in, the strength of the whole thing
rests on rate limiting — which Better Auth enables only in production and backs
with in-process memory by default. On a multi-instance deployment that is a
per-instance limit. Blueprint 7.6 requires rate limiting; making it shared
storage is the work that closes this properly.
