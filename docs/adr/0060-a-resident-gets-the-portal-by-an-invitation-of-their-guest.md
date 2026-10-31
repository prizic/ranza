# 0060. A Resident gets the Portal by an invitation of their Guest

Date: 2026-10-31

Status: Proposed — the owner has not accepted it. Applied provisionally in
`20260916013900_a_guest_is_invited_to_the_portal` and
`20260916013910_a_resident_reads_their_room_and_their_balance`.

Builds on [ADR 0005](0005-better-auth-with-provider-indirection.md),
[ADR 0009](0009-a-resident-reaches-their-own-stay-not-an-organization.md),
[ADR 0015](0015-money-is-an-integer-a-balance-is-a-sum-and-a-correction-is-a-line.md),
[ADR 0025](0025-a-bed-is-a-unit-under-a-room.md),
[ADR 0053](0053-an-invited-person-gets-a-login-through-the-link-and-it-is-tied-to-the-user-the-invitation-made.md),
[ADR 0057](0057-a-propertys-operating-model-sets-its-defaults-and-its-words-never-its-rules.md)
and [ADR 0058](0058-a-guests-particulars-are-read-by-permission-apart-from-the-guest.md).
The rows are GP-S2, GP-S3, GP-S4 and GP-DEF-05 to GP-DEF-11 in
[`docs/features/guest-portal/edge-cases.csv`](../features/guest-portal/edge-cases.csv).

## Context

ADR 0009 gave a Resident their own path to their own Stay, keyed on
`stays.user_id`. Nothing ever wrote that column (GP-DEF-02), so no Resident
could see anything: accounts were tied to Stays by hand. A dormitory has the
opposite problem to a hotel. Hundreds of students are registered in move-in
week, many before any Stay exists, and each needs a phone login to see a bed, a
term and what they owe.

## Decision

**The invitation is of a Guest, not of a Stay.** Accepting it gives that Guest's
own current Stays to the account, and a trigger gives the Stay a check-in makes
later the login the Guest already has. A Stay-bound link would have to be made
again for every Stay, would not exist at registration, and would leave a student
with a second term without a login. Comparable systems differ: Mews and
Cloudbeds hang guest access on the reservation, which suits a hotel stay and
not a student who stays three years. A Guest has at most one live link and at
most one login; an account belongs to one Guest of an Organization.

**The token is the credential and is kept nowhere.** 256 random bits, shown
once as a link, a copy button and a QR code the student scans from the desk's
screen; only its SHA-256 digest is stored, in a column the runtime role is not
granted. It lasts fourteen days, set by the database, is used once, and a new
invitation withdraws the earlier one in the same statement. Expired is read,
not stored.

**A permission of its own, `guests.invite_to_portal`**, held by the shipped
Owner, Manager and Front desk. It is not folded into `front_desk.book`: a link
is a login to a student's stay and balance, and an Organization may keep it from
a trainee, as it may `guests.read_particulars` (ADR 0058). The gate also asks
that a Property of the Organization have the front desk and the Portal switched
on, because an invitation to a Portal that is off leads to an empty page.

**Accepting is an audited definer that writes `stays.user_id`.** The user is
never an argument; the refusals (unknown, withdrawn, used, expired, an account
already connected to another Guest) are returned and not raised, so the page can
say them in the reader's words, which ADR 0053 allows for the holder of a
256-bit token. A Stay that already names another account is left with it, and
the audit record counts both. The page behind the link reads the link's state
through a read-only definer that takes the digest and names the Guest and the
Organization and nothing else.

**The student's address is their own.** The address on file is a suggestion on
the form and is not matched: the link is the credential, as in ADR 0053. No
email or SMS provider is added; sending is outward-facing and RANZ-85 is
unbuilt (GP-DEF-05).

**My stay shows the room, the term and the balance, each through the Resident's
own path (ADR 0009).** The room is a policy of its own on `accommodation_units`.
The balance is a function and not the policy the brief first asked for: a policy
bounds rows and a line's description is a column, so a policy on `folio_lines`
would hand a student every line the desk typed. The function returns the stay,
the currency, the Folio's status and the sum, asks the Resident's own commercial
gates, and returns no row for a Stay with no Folio, which is not a zero balance
(ADR 0015). A statement of account is GP-DEF-09.

**The next instalment is a third read of the same kind, and reads the standing
rather than restating it.** The plan is [ADR 0059](0059-a-resident-pays-by-instalments-the-worker-charges-on-their-due-dates.md)'s
and `app.payment_plan_standing` is its one definition of overdue; that function
is security invoker and reads through staff reach, so called as a Resident it
returns nothing. A policy on the plan tables would hand a student the columns a
revision writes. So `app.resident_next_instalments` calls the standing from
inside a definer, for the Stays the signed-in user holds and no others, and
returns the oldest instalment not paid in full: its number, how many the plan
has, its due date, what is still owed on it, where it stands, and how much is
overdue in all. The figure on the card is what is still owed on that instalment,
which for a part-paid one is less than its face amount: what a student needs to
know is what to pay next, and payments settle the oldest instalment first. A
walk-in Stay names no booking and is left out, because the standing of a
Property with no booking named is the standing of every booking in it
(GP-S4-11 to GP-S4-17; the card is GP-S4-18 to GP-S4-20).

**Nothing reads `operating_model`.** A hotel's long-stay guest uses the same
invitation (ADR 0057).

## Consequences

- Eight security-definer functions are added to the inventory: four for the
  invitation (make, withdraw, state, accept), the trigger function that gives a
  later Stay its Guest's login, and three reads for the Resident (their room,
  their balance and their next instalment).
- Two reach clauses are provably redundant and stay anyway: in
  `app.may_invite_to_portal` and the read policy, `accessible_organization_ids()`
  is implied by `has_organization_permission()`, since both ask for an active
  membership of the Organization. A sabotage that deletes either goes green, as
  RG-S1-17 did for the Guest summary, and they stay so a change to one helper
  cannot widen the other silently.
- No screen switches the Portal on for a Property: `portal_stay_overview` is a
  `property_capabilities` row that only seeds and tests write. Until a screen
  exists, the invite section says the Portal is off and why instead of hiding.
- A link claimed by the wrong person cannot be undone from a screen (GP-DEF-06).
- Two clauses of `app.resident_next_instalments` are each enough alone and both
  stay: the Stay must name a booking, and the rows returned are matched to that
  booking. Deleting either goes green and deleting both goes red, so a change to
  one cannot widen the other silently. The gates imply a current Stay in the
  Property, so the status clause matters only to a student who holds a finished
  Stay and a current one in the same Property, which the suite asserts.
- The instalment card counts waived and paid instalments in its position
  ("instalment 2 of 4"), and an instalment not yet charged is not in the balance
  figure beside it, so the two numbers answer different questions: what the
  Folio says now, and what the plan says next.
