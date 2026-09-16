# @ranza/reservations

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Added

- `reverseCheckIn(userId, stayId, reason)`: withdrawing a check-in that should
  not have happened. The Stay becomes `cancelled` — never deleted, never edited
  back to `reserved` — and the Reservation returns to `confirmed`, in one
  transaction with the audit record and a `stay.check_in_reversed` event
  ([ADR 0022](../../../docs/adr/0022-a-mistaken-check-in-is-reversed-not-deleted.md)).
  Refused once anything has been posted to the Stay's Folio, which arrives as
  `StayHasChargesError` because it is the one refusal a front desk can act on.
  `checked_in` is no longer terminal.

- Check-in and check-out publish `stay.checked_in` and `stay.checked_out`
  through `publishWithin`, in the transaction that produced the fact
  ([ADR 0017](../../../docs/adr/0017-cross-module-facts-travel-through-a-transactional-outbox.md)).
  Published after the commit instead, a crash in between would lose the fact
  with nothing recording that anything was owed; published before it, a rollback
  would announce something that did not happen. The payloads carry ids and
  dates, never a name: the queue is the one table a single process reads across
  every Organization.

### Changed

- `checkIn` refuses a Reservation whose first night has not arrived, and one
  whose last night has passed. Without the first, a booking three weeks out
  became an `in_house` Stay with future dates and a second Guest could take the
  same Unit tonight, because `stays_no_double_booking` sees two ranges that do
  not overlap. `stays_insert_front_desk` refuses the same row independently
  (`20260916001300_check_in_on_the_day`); the predicate here is what makes the
  refusal an empty result rather than a constraint violation to decode.
- The Stay now starts on the day the Guest actually arrived, not the day they
  were booked for. Somebody two days late began their Stay today, and recording
  the planned date held the Unit over two nights nobody slept in.
- Check-in opens the Stay's Folio through `openFolioWithin` (blueprint 6.1
  step 5), in the same transaction as everything else it does. `CheckedIn`
  gained `folioId`, which is null where the Property does not do billing —
  `front_desk` and `finance` are separate Entitlements, and a check-in must not
  depend on the second.
- `checkOut` no longer turns every failure into `CheckOutError`. A bare `catch`
  also swallowed constraint violations and lost connections, reporting both to
  the front desk as "you cannot" and to the logs as nothing at all; only
  `StayWriteError` is translated now.

### Added

- The `reservations` table: a planned allocation of an Accommodation Unit for a
  period, with the same composite foreign keys as every other Property-scoped
  row, and the lifecycle `requested → confirmed → cancelled | no_show |
checked_in`.
- The product's first write policies. `INSERT` and `UPDATE` on `reservations`
  and `INSERT` on `stays` are bounded by a `WITH CHECK` carrying all four of
  blueprint 3.5's gates, because a write has no surrounding query to carry them
  ([ADR 0012](../../../docs/adr/0012-a-write-is-bounded-by-a-policy-not-a-check.md)).
- `stays_no_double_booking`, an exclusion constraint over `btree_gist` and a
  half-open `daterange`. Two current Stays on one Accommodation Unit over
  overlapping nights are now unrepresentable rather than checked.
- `stays.reservation_id`, unique, so a Reservation produces at most one Stay.
- `listArrivals()`, `checkIn()` and `FRONT_DESK_CAPABILITY`.

No availability search, no group reservations, no quotations, deposits,
extensions, room moves or check-out. `no_show` is a status value nothing sets
yet.

- `checkOut()` and `listDepartures()`. Check-out ends the Stay, records the
  departure date and writes one audit record, in a single transaction; the Unit
  is free the moment it commits. Departures include Stays already past their
  planned end, flagged `overdue`.
- `ranza_app` may `UPDATE` a Stay's `status`, `ends_on` and `updated_at` and
  nothing else, by a column-level grant — so a check-out cannot become a room
  move, which a row-level policy cannot express
  ([ADR 0012](../../../docs/adr/0012-a-write-is-bounded-by-a-policy-not-a-check.md)).
