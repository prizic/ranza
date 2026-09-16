# @ranza/reservations

The Reservation — a planned allocation of an Accommodation Unit for a period,
which may become a Stay through check-in (blueprint sections 2 and 5.3) — and
the check-in itself.

This is the product's **first write path**. Everything tenant-owned before it
was `SELECT` only for `ranza_app`, with one exception the audit module owns.
What bounds a write here is a row-level policy, not an application check; see
[ADR 0012](../../../docs/adr/0012-a-write-is-bounded-by-a-policy-not-a-check.md),
which every later module is expected to copy.

## What this module owns

The `reservations` table, its policies and its grants, in
[`prisma/migrations/20260916000900_reservations`](../../../prisma/migrations/20260916000900_reservations/migration.sql).

Check-in also touches two things `@ranza/stays` owns — `stays.reservation_id`
and the exclusion constraint that makes double-booking unrepresentable — and
those live in
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
await reservations.listArrivals(userId, propertyId);
await reservations.checkIn(userId, reservationId);
```

`listArrivals` returns the Reservations arriving **on the Property's own day**,
which is not the reader's: a front desk in İzmir and one in Dubai are working
different dates at the same moment. Cancelled and no-show Reservations are
absent because they are not arriving; already checked-in ones stay, so the list
still shows the day's work after it has been done.

`checkIn` does three things in one transaction — creates the Stay, moves the
Reservation to `checked_in`, and writes an audit record naming the actor
(blueprint 7.4). It fails whole or succeeds whole. A Stay with no Reservation
behind it, a Reservation marked arrived with nobody in a room, and an action
with no audit record are each worse than the check-in not happening, and each is
what a second transaction would eventually produce.

Two concurrent check-ins on one Unit over overlapping nights end with exactly
one Stay. The loser fails on `stays_no_double_booking`, an exclusion constraint,
rather than on a comparison the application made and lost.

### Failures

`CheckInError` covers every reason a Reservation could not be checked in — out
of reach, cancelled, already arrived, never existed. One type on purpose: told
apart, the first of them would confirm that a Reservation the caller cannot see
is there. `UnitUnavailableError` extends it and is the exception, because a
Unit already being occupied is the one failure a front desk can act on.

## What is deliberately not here

Blueprint 5.3 also lists group reservations, quotations, deposits, availability
search, extensions, room moves, check-out and no-show handling. None of them are
in this module. `no_show` exists as a status value because the lifecycle needs
the value to exist, not because anything here sets it — and there is no UPDATE
or DELETE policy on `stays` for the same reason (blueprint section 13).

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
