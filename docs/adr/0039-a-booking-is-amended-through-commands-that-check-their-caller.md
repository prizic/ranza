# 0039. A booking is amended through commands that check their caller

Date: 2026-09-28

Status: Proposed — applied in `20260916009000_a_booking_is_amended`,
`20260916009100_a_stay_changes_its_departure` and
`20260916009200_a_guest_moves_room`

Amends [ADR 0029](0029-housekeeping-status-is-a-room-s-own-row.md): a room a
Guest was moved out of reads dirty, as one a Guest left does;
[ADR 0033](0033-an-in-house-stay-holds-its-unit-until-it-is-checked-out.md):
the commands that change a Unit take every Unit lock they touch, in hashed
order; and [ADR 0038](0038-a-night-is-priced-by-its-unit-type-and-fixed-when-booked.md):
a booking still to come moved to another kind of Unit takes that kind's price.

Builds on [ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md),
[ADR 0033](0033-an-in-house-stay-holds-its-unit-until-it-is-checked-out.md) and
[ADR 0038](0038-a-night-is-priced-by-its-unit-type-and-fixed-when-booked.md).

## Context

Changing a booking's dates or Unit, a Guest's departure and a Guest's room
(docs/features/amend-booking) writes columns `ranza_app` has never been granted:
`reservations.starts_on`, `ends_on`, `accommodation_unit_id` and
`stays.accommodation_unit_id`. ADR 0012's shape would widen the column grants
and let the update policies bound the rows. Here that shape leaks.

**The update policies are keyed on the new status.** `WITH CHECK` sees the row
as it will be, so the policy on `reservations` asks for `front_desk.check_in`
whenever the result is `confirmed` or `checked_in`. A grant on the dates is the
whole role's, so every check-in holder could amend a booking without
`front_desk.amend`. A second, amend-shaped policy would be OR-ed with the first,
and because `status` is already granted, a role holding only `front_desk.amend`
could then turn a confirmed booking into a checked-in one. A restrictive policy
cannot see the old row either, so it cannot tell "the same status, new dates"
from "a new status".

**Stays cannot take it at all.** Their update policy refuses every row that is
still `in_house`, because until now no command changed a Stay without ending it.

The edge cases were first written with the ADR 0012 shape in mind (AB-S1-22,
AB-S1-23, AB-S1-25 named policies and new grants). What they promise did not
change; the mechanism did, and the rows now say so.

## Decision

### Three commands, each a definer that checks its caller first

`app.amend_reservation()` changes a booking that has not arrived (slice 1).
`app.change_departure()` and `app.move_stay()` follow for an in-house Guest.
Each asks `app.can_use_capability(property, 'front_office', 'front_desk')` —
the four gates of blueprint 3.5 — and `app.has_organization_permission(org,
'front_desk.amend')` — the fifth — before it reads anything it returns. A row
out of reach, a row that does not exist and a row in the wrong state all answer
`42501`, as a policy would.

`ranza_app`'s update grants do not change: `(status, updated_at)` on
reservations, `(status, ends_on, updated_at)` on stays. Nothing a caller runs can
reach the dates or Unit except these commands. That is a stronger statement
than ADR 0012's shape would have made here, and the pgTAP suite asserts the
exact grants.

### The global lock order, with two Units

Every Unit the change touches is locked in hashed order (namespace 2), then the
Property's business day shared (namespace 3), then the Stay (namespace 1) when
there is one — ADR 0038's order. Two changes between the same two rooms wait for
each other rather than deadlock. Row locks come after the advisory ones.

The booking is re-read `FOR UPDATE` and refused as changed (`RZ003`) if its Unit
moved since it was first read, or if another revision landed since the version
its caller previewed. The version is the number of revisions, not `updated_at`,
whose microseconds a JavaScript `Date` loses.

### Availability stays with the constraints

`reservations_no_double_booking` (`23P01`), `app.unit_holds_one_occupancy`
(`55006`) and `reservations_unit_is_sellable` (`55000`) decide as they do for a
booking taken there. The command states only what no trigger on reservations
can: the arrival is today or later, a Guest booking has a departure, and the new
Unit is in service (`55000`; only Stays have that trigger). The Unit is named in
`SET` only when it changes, so a date change is never refused by a Unit trigger
for a reason the change did not cause.

### Every change is a revision

`reservation_changes` holds one append-only row per change: its kind, the dates,
Units and price before and after, the business date, the reason, and who. The
command writes who, when and the business date from the database, never from
its caller. It is read by reach, written by nobody but the commands, and a
trigger refuses update and delete for every role, the owner included, because
row-level security does not bind the owner a definer runs as.

### Only another kind of Unit is another price

`app.reservation_is_priced_for_its_new_kind()` stamps a booking still to come
with today's price for its new Unit's kind when the kind changes, or leaves it
unpriced when that kind has none. Dates alone never re-price, and a Guest in
house keeps their price when moved. It holds the Property row `FOR SHARE`, as
the insert stamp does, and refuses rather than unprices when the Property is
out of reach, since on an update that would erase a price the Guest agreed.

### A finished booking or Stay keeps its dates

A trigger refuses changing the dates or Unit of a booking that is checked out,
cancelled or a no-show, and of a Stay that is departed or cancelled, for every
role. It closes a gap ADR 0033's follow-up left open: `ranza_app` could rewrite
a departed Stay's `ends_on`. The closed-day trigger's branch for a departed Stay
is therefore no longer reachable, and its assertions now name the rule that
binds.

### A departure moves with its booking

`app.change_departure()` changes an in-house Stay's planned end and its
booking's in one transaction, tomorrow or later: leaving today is a check-out,
which reviews the bill. A night in house is due whatever the planned end says
(`app.room_nights_due`), so extra nights are charged at the booking's own price
as each closes, and nothing already charged moves. A night another booking
holds is refused by `app.unit_holds_one_occupancy`, not by the command.

### A move keeps the Stay and changes the room from tonight

`app.move_stay()` changes the Unit of the Stay and its booking. The Folio and
the price go with the Guest; a move to another kind of Unit is usually the
hotel's decision, and an upgrade the Guest pays for is a Folio charge. What may
take the Guest is what decides it at check-in — in service, let whole, nobody
booked or in house — plus readiness, which the command asks (`RZ002`), as
check-in asks it in the module.

The nights already slept stay where they were slept. The revision is the
record of that: `app.stay_unit_segments()` cuts a Stay into one stretch per
Unit, and the room calendar draws each stretch on its own row.

The room left must read dirty before the worker runs, or a second move or a
check-in lands in an uncleaned room. `app.unit_housekeeping_state()` counts a
move out as it counts a departure (ADR 0029 amended), and `stay.moved` has the
worker mark it on the board. The worker reads which room was left from the
revision the event names, never from the event's payload, which `ranza_app`
may write. A move between two beds of one room leaves no room to clean.

Two Guests swapping rooms at once would deadlock if their Unit locks were taken
in the order each met them; the hashed order is what prevents it, seen by
sabotage. Each is then refused, because the other Guest is still there: a swap
takes a third room.

## Consequences

The definer inventory in `tests/database/insert_grants.test.sql` grows with
every command, and each must keep naming its caller check for IG-12's sweep. A
gate forgotten in a definer is a hole rather than a refusal, which is why each
clause is broken in turn in the suite and seen red.

A later command that confirms a `requested` booking must take the Unit's lock
(namespace 2) before it locks the booking's row. `app.unit_holds_one_occupancy`
takes that lock only when a row moves into `confirmed`, which is after the row
lock, and `app.amend_reservation()` takes them the other way round; the two
would deadlock. Nothing confirms a requested booking today.

`stays.accommodation_unit_id` changes meaning. It was the Unit a Stay used;
after a move it is only the Unit the Guest is in now. Every reader that asks
which Units a Stay used must read the `moved` revisions too: the room
calendar, readiness, the worker, a damage charge (MT-S5-07) and the audit
search all do, and the next one to ask must. A check-in whose Guest has been
moved is not withdrawn (`RZ004`): it would put the booking back on a room the
Guest never arrived in.

Refusal codes gain `RZ003`, changed since it was read. A price that moved while
the dialog was open stays `PriceChangedError` in the module, as when a booking
is taken.
