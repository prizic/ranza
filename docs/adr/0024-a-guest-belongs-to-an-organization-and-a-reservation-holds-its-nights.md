# 0024. A Guest belongs to an Organization, and a Reservation holds its nights

Status: Accepted
Date: 2026-09-17

Amended: 2026-09-25 — the double-booking constraint shipped as
`where (status = 'confirmed')` in the commit that implemented this record
(949b667), not the `('confirmed', 'checked_in')` sketched under "A Reservation
holds its nights". A checked-in Reservation's Stay holds its nights instead,
which ADR 0033 builds on. The sketch is left as written; see RG-S1-12.

## Context

Until now nothing in Ranza created a Reservation. Every one was written by
`scripts/db-seed-dev.mjs`, so the product could check somebody in and bill them
and could not be told they were coming. Two things had been deferred on exactly
that ground, and taking a booking makes both of them due at once.

**A Reservation carried `guest_name`, a string.** That was honest while nothing
created one: a name is what a seed has. It cannot hold a document, a guardian,
an emergency contact, or the fact that the person arriving in November is the
person who left in March — which is the whole of blueprint 18.7, and the reason
`docs/roadmap.md` named Guest profiles the next structural piece.

**Two confirmed Reservations could overlap on one Accommodation Unit.**
[ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md) left that out and
said why: whether they may is an overbooking policy, and blueprint section 13
forbids the rule before the workflow that needs it. Creation is that workflow.
The rule now has a place to be enforced and a command that would otherwise
quietly let a front desk sell one room twice.

## Decision

### A Guest belongs to an Organization

`guests` is the first tenant-owned table in this repository that is not
Property-scoped.

Everything a Guest exists for beyond a single booking is an Organization-wide
question. Blueprint 18.7 asks for one governed Guest workspace with a history
across Reservations and Stays, duplicate detection reviewed by staff, and a
consent and retention state — none of which a Property-scoped record can answer
without a merge afterwards. Mews is cited in blueprint 19 for exactly this
(deduplicated Guest profiles), and a Guest who stayed at the Organization's
other Property is the same person. A front desk that could not find them would
create the duplicate that 18.7 is written to prevent.

This has a consequence worth stating plainly rather than discovering: a Staff
Member assigned to one Property can read the Organization's Guests, including
people who have never been to their Property. That is wider than any other read
here. It is accepted because the alternative is the duplicate above, and because
a Guest record holds a name and contact details rather than a Stay, a Folio or a
rate — those stay Property-scoped and are not reachable through this.

### An Organization-scoped write asks the same four gates

Every write policy so far could name a Property, because every writable row had
one, and `app.can_use_capability(property_id, module, capability)` is how
blueprint 3.5's gates reach a write (ADR 0012). A Guest has no Property.

Dropping to `app.accessible_organization_ids()` for the write would have left
gates 1-3 applying to reading a Guest and not to recording one — the same
commercial hole ADR 0012 was written about, in a new place. So the question
becomes the same one asked of any Property, asked of any Property:

```sql
app.can_use_capability_in_organization(organization_id, 'front_office', 'front_desk')
```

true when the four gates hold at **some** Property of that Organization the
acting Staff Member reaches. Answering yes for one Property answers yes for the
Organization's Guests, which is the correct reading — a person is not the
property of a building.

The capability named is another module's, which is new. It is a narrowing rather
than an oversight: taking a booking is the only thing in the product that
records a Guest, so `front_office` is the only entitlement under which one can
appear. When a Guest 360 screen exists it brings its own key and the policy
gains a second clause — an OR, not a replacement, because the front desk must go
on working without it.

### `guest_name` is gone, not kept beside the Guest

The column was backfilled into `guests` — one Guest per distinct name within an
Organization — and dropped. Two places holding one person's name is the drift
this repository refuses in its documents, and there is no reason data deserves
less.

### A returning Guest is matched on an exact email, and on nothing else

`identifyGuestWithin` reuses an existing Guest when the Organization already has
one at that address, and creates one otherwise. Blueprint 18.7 forbids merging
ambiguous people automatically and asks for staff review with the evidence in
front of them; an exact address is not an ambiguous match, and treating two
bookings under one as two people is the duplicate that review would then have to
undo. A similar name, a shared telephone number, a matching date of birth: all of
those belong to that review workflow and none of them is here.

Two people booked with no email are therefore two Guests. That is correct —
nothing distinguishes them — and it is why a partial unique index rather than a
total one.

The existing profile's details are kept when a returning Guest is found.
Somebody booking as "A. Lovelace" must not silently rewrite the record, which is
an edit and belongs to a screen that says so. Nothing edits a Guest: `ranza_app`
is granted `update (updated_at)` and no other column, so building that has to
widen a grant deliberately (ADR 0012's second half).

### A Reservation holds its nights

```sql
exclude using gist (
  accommodation_unit_id with =,
  daterange(starts_on, ends_on, '[)') with &&
) where (status in ('confirmed', 'checked_in'))
```

The same shape as `stays_no_double_booking` and for the same reason: two clerks
booking one Unit for one set of nights both read "free", and only one of them
can commit. Availability is a constraint here, never a query, because a query is
a race with a window.

The status list is the decision inside the decision. `confirmed` and
`checked_in` are allocations. `requested` is not — it is somebody asking, and
refusing a second enquiry would be an availability policy nobody has specified.
`cancelled` and `no_show` keep their dates and stop holding the Unit, which is
what makes it re-lettable without deleting history (blueprint 7.4).

`createReservation` therefore writes `confirmed`. A front desk taking a booking
is allocating the Unit — that is what the person on the telephone is being told.
`requested` is what a booking engine or a channel will write when one exists, and
confirming it will then be the act that has to pass this constraint.

`reservations_period_check` tightened from `ends_on >= starts_on` to
`ends_on > starts_on` in the same migration, because it is the hole the
constraint cannot see: `daterange(x, x, '[)')` is empty and overlaps nothing, so
a zero-night booking would hold no Unit while looking exactly like one that did.
The same edge `stays_in_house_has_a_night` closes on the other table.

## Consequences

A Guest is reachable across an Organization's Properties, which is what
blueprint 18.7 will need and is wider than any other read here. It is asserted
directly in `tests/database/guests_and_reservation_creation.test.sql` rather
than left as reasoning, including the half that matters more: a Resident reaches
no Guest at all, because `guests_read_own_organization` resolves through
`app.accessible_organization_ids()` and a Resident has no membership (ADR 0009).

`app.can_use_capability_in_organization()` is a second gate surface. It is
defined in terms of the first rather than beside it, so a change to blueprint
3.5's gates cannot be applied to one and forgotten in the other.

Booking a Unit that is already taken is now a refusal a front desk is shown
rather than a row it creates. `UnitUnavailableError` stopped being a subclass of
`CheckInError` to say so: availability is one question about a Unit and a
period, and two commands ask it.

The migration that carries all of this backfills data, which means it lifts
`FORCE ROW LEVEL SECURITY` on `reservations` for the length of the backfill and
restores it before it ends. A migration runs in one transaction, so no concurrent
session sees the table unprotected — but it is the first migration here to
disable a protection on purpose, and the next one that needs to should copy the
shape rather than reach for a privileged role.

Nothing cancels, amends or moves a Reservation. The list this slice adds has no
row actions for that reason: those are blueprint 5.3 and building a menu for
them would be inventing the workflows (blueprint section 13).
