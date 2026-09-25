# @ranza/reservations

The Reservation — a planned allocation of an Accommodation Unit for a period,
which may become a Stay through check-in (blueprint sections 2 and 5.3) —
together with taking one, checking it in, and checking it out.

This is the product's **first write path**. Everything tenant-owned before it
was `SELECT` only for `ranza_app`, with one exception the audit module owns.
What bounds a write here is a row-level policy, not an application check; see
[ADR 0012](../../../docs/adr/0012-a-write-is-bounded-by-a-policy-not-a-check.md),
which every later module is expected to copy.

## What this module owns

The `reservations` table, its policies and its grants, in
[`prisma/migrations/20260916000900_reservations`](../../../prisma/migrations/20260916000900_reservations/migration.sql),
and `reservations_no_double_booking` in
[`prisma/migrations/20260916002000_guests_and_reservation_creation`](../../../prisma/migrations/20260916002000_guests_and_reservation_creation/migration.sql).

Taking a booking also records a Guest, which [`@ranza/guests`](../guests/README.md)
owns. It goes through `identifyGuestWithin` for the same reason check-in goes
through `openStayWithin`.

Check-in and check-out write to `stays`, which `@ranza/stays` owns. They do it
through `openStayWithin` and `closeStayWithin` rather than issuing their own
SQL, so the tier rule that no module writes another's tables stays true rather
than merely stated. Those functions take this module's transaction, for the same
reason `recordWithin` does: the three writes share one fate.

`stays.reservation_id` and the exclusion constraint that makes double-booking
unrepresentable live in
[`prisma/migrations/20260916001000_check_in`](../../../prisma/migrations/20260916001000_check_in/migration.sql)
with the write policy for `stays`. No other module writes to either table.

A Reservation carries `organization_id` and `property_id` next to
`accommodation_unit_id`, and composite foreign keys across all three prove the
Unit is in that Property in that Organization. That pattern matters more here
than anywhere before it: this is the first table a request can insert into, so
an organization_id that merely _looks_ valid is rejected by a foreign key before
a policy is ever consulted.

## Contract

```ts
const reservations = createReservationsModule({ db }); // the ranza_app client
await reservations.listReservations(userId, propertyId);
await reservations.listBookableUnits(userId, propertyId);
await reservations.createReservation(userId, booking);
await reservations.listArrivals(userId, propertyId);
await reservations.listDepartures(userId, propertyId, "due" | "in_house");
await reservations.checkIn(userId, reservationId);
await reservations.checkOut(userId, stayId, {
  folioVersion,
  earlyDeparture,
  balanceReason,
});
```

`checkOut` is confirmed against the review of the bill the desk saw: the Folio's
line count, whether the Guest is leaving early, and — while nothing can take a
payment — why a balance is left open. It compares all three under the Stay's
lock and refuses a review that is no longer true
([ADR 0030](../../../docs/adr/0030-a-check-out-confirms-the-bill-it-reviewed.md)).

`listArrivals` returns the Reservations arriving **on the Property's own day**,
which is not the reader's: a front desk in İzmir and one in Dubai are working
different dates at the same moment. Today's stay all day, checked in or not, so
the list still shows the day's work after it has been done. A late arrival —
somebody who should have come yesterday and has not — stays only while check-in
would still accept them, because that is the only thing this screen does with
them; once their last night has passed they are gone, and so is every Guest
checked in on an earlier day. Cancelled and no-show Reservations were never on
it, because they are not arriving.

`canCheckIn` is the predicate `checkIn` applies, not a restatement of it. A row
can be listed and not offered — somebody already checked in today is the case
that remains — and nothing offered should raise when pressed.

`createReservation` is the first thing in the product that makes one. A Guest
and a Reservation in one transaction, with the audit record and the outbox event
inside it, because a Guest recorded for a booking that was refused is a profile
nobody asked for. Everything written comes from the row the Unit query returned,
never from the caller — the Organization above all.

It writes `confirmed`, not `requested`: a front desk taking a booking is
allocating the Unit, and only a confirmed Reservation holds its nights under
`reservations_no_double_booking`. `requested` is what a booking engine or a
channel will write when one exists, and confirming it will then be the act that
has to pass that constraint ([ADR 0024](../../../docs/adr/0024-a-guest-belongs-to-an-organization-and-a-reservation-holds-its-nights.md)).

`listReservations` is the booking list: what is current or still ahead at one
Property. It exists because a Reservation taken for a fortnight's time never
appears on the arrivals list, so without it creating one has no observable
effect. `listBookableUnits` returns every Unit in service rather than every free
Unit — whether particular nights are free is the constraint's answer, and a list
filtered here would be stale before anybody pressed the button.

`checkIn` does three things in one transaction — creates the Stay, moves the
Reservation to `checked_in`, and writes an audit record naming the actor
(blueprint 7.4). It fails whole or succeeds whole. A Stay with no Reservation
behind it, a Reservation marked arrived with nobody in a room, and an action
with no audit record are each worse than the check-in not happening, and each is
what a second transaction would eventually produce.

Two clerks taking the same booking at the same moment end with exactly one
Reservation. The loser fails on `reservations_no_double_booking`, an exclusion
constraint, rather than on a comparison the application made and lost — and
`stays_no_double_booking` says the same thing one layer down, for the case a
booking over a Guest who is already in house still reaches.

`checkOut` ends a Stay and frees the Unit, in one transaction with its audit
record. It sets `ends_on` to the day they actually left rather than leaving the
planned date: a long-term Resident's Stay is open-ended, so without that a
departed Stay would never record when it ended — and a Guest who leaves early
did leave early. The planned period belongs to the Reservation and is unchanged.

`listDepartures` includes Stays already past their planned end, flagged
`overdue`. A departures list showing only today hides the Guest who should have
left on Tuesday, which is the row a front desk most needs.

### Failures

`CheckInError` covers every reason a Reservation could not be checked in — out
of reach, cancelled, already arrived, never existed. One type on purpose: told
apart, the first of them would confirm that a Reservation the caller cannot see
is there. `ReservationRefusedError` is the same shape for a booking that could
not be taken.

Two failures stand outside that, because they hide nothing and the person
looking at the screen can fix them. `UnitUnavailableError` says the Unit is
already held over those nights — the answer to both a booking and a check-in, so
it belongs to neither. `ReservationPeriodError` says the dates are not a period
a Reservation can have: ending before it starts, covering no night, or starting
before the Property's own today.

## What is deliberately not here

Blueprint 5.3 also lists group reservations, quotations, deposits, availability
search, extensions, room moves and no-show handling. None of them are in this
module. Nothing cancels or amends a Reservation either, which is why the booking
list has no row actions. `no_show` exists as a status value because the lifecycle needs the value
to exist, not because anything here sets it.

Room moves are the one worth naming: they are refused by a column-level grant
rather than by this module declining to attempt them, so a future command that
tries becomes a database error instead of a silent room move
([ADR 0012](../../../docs/adr/0012-a-write-is-bounded-by-a-policy-not-a-check.md)).
There is still no DELETE anywhere.

## Rules

- Receives its client; never constructs one and never reads `process.env`.
- Only `index.ts` is importable, and only from an application's server funnel
  ([ADR 0007](../../../docs/adr/0007-a-session-becomes-a-request-context.md)).
- Contains no authorization logic of its own. Blueprint 3.5 is decided in the
  database, for writes as well as reads.
- Depends on `@ranza/platform-audit` directly rather than through an adapter.
  The audit contract is already opaque — an id, an actor, an action name — so
  there is nothing for an adapter to translate away.

Verified against a real database by
[`tests/database/reservations_and_check_in.test.sql`](../../../tests/database/reservations_and_check_in.test.sql)
and
[`tests/integration/front-office.test.ts`](../../../tests/integration/front-office.test.ts),
each of which was checked by breaking the boundary it asserts — dropping the
`WITH CHECK`, widening the policy, removing the exclusion constraint — and
confirming it went red.
