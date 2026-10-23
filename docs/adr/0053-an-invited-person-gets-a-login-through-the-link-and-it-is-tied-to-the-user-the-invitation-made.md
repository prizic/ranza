# 0053. An invited person gets a login through the link, and it is tied to the user the invitation made

Date: 2026-10-18

Status: Proposed — the owner has not accepted it. Applied provisionally in
`20260916011900_an_invitation_can_be_looked_at_before_it_is_accepted`.

Builds on [ADR 0005](0005-better-auth-with-provider-indirection.md) and
SP-S1-32, SP-S1-33 in `docs/features/staff-and-permissions/edge-cases.csv`.

## Context

Inviting somebody writes a Ranza user, an active membership and a pending
invitation (SP-S1-01), and shows a token. Nothing in the application consumed
the token, so a person on the roster as "Awaiting a password" had no way to set
one (PEOPLE-01, RANZ-68). SP-S1-32 had said when that would stop being harmless:
the day a route accepts the invitation, the caller's identity must be checked
against the invitation in the same change.

Two shortcuts were available and both are wrong. Letting `linkRanzaUser` adopt
an existing Ranza user by email would hand the membership waiting for an address
to whoever signs up with it first, because the sign-up route is open and does
not verify the address. Letting `accept_staff_invitation()` say why a token
failed would make it an oracle — but only for a token nobody holds, and a
256-bit token cannot be guessed, so telling the holder of a token that exists
what state it is in costs nothing.

## Decision

**The link is the credential, and the address comes from the invitation.** The
page behind `/{locale}/accept-invitation?token=` asks the database what state
the token is in (`app.staff_invitation_state()`, a read-only definer that takes
the token's digest and returns nothing for a digest that matches nothing). It
shows the invitation's own address and never takes one from the form.

**A login is created through Better Auth's own sign-up route and then tied to
the invited user by `linkInvitedUser()`**, which refuses an account that does
not carry that user's address, refuses a user who can already sign in, and is
the only code that gives an identity to a user it did not create. Going through
the route handler keeps the shared rate limit on it (three attempts in ten
seconds, as sign-in), so a token cannot be tried faster than a password. The
session cookie is handed over only after the link and the acceptance have
succeeded.

**A signed-in stranger is refused** — the link is for one person, and the page
says so rather than accepting on somebody else's behalf. Somebody who already
has a login signs in with it and accepts; a second factor is finished on the
sign-in page.

**Each unusable link says why**: unknown, expired, already used, withdrawn,
access removed, somebody else's. SP-S1-33's "one answer" stays true for
`accept_staff_invitation()` and for a stranger without a token.

**Accepting is recorded** as `staff.invitation_accepted`, by the person who
accepted, in a transaction of its own because the accepting statement runs
without a request context.

## Consequences

- Sign-up and linking are two steps, so a fault between them leaves an account
  for the invited address that no Ranza user owns. A retry signs in with the
  submitted password and, if that opens the account, finishes the attempt: the
  password proves the account is the person's. Anything else — another
  password, a second factor, an identity that already belongs to another Ranza
  user — is "an account with this address already exists", and nothing is
  deleted, moved or taken over: that is a support decision.
- A lost or expired link is renewed from the roster (`reissueInvitation`), which
  withdraws the old one in the same transaction; somebody revoked past the undo
  window is added back with the same membership and a new link (SP-S1-16).
- Notifications (blueprint 5.12) will deliver the link by email; until then the
  dialog says plainly that nothing was sent.
- `app.staff_invitation_state()` is the seventy-fifth definer and writes
  nothing.
