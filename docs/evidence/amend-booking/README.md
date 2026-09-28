# Amend booking — sabotage record

Every assertion that claims a boundary for [ADR 0039](../../adr/0039-a-booking-is-amended-through-commands-that-check-their-caller.md)
was seen red with that boundary broken, as AGENTS.md asks. Each break printed
the altered object before its run counted, and the object was restored after.
The drivers and the breaks are in [`sabotage/`](sabotage); they run against a
local container only (`RANZA_PG_CONTAINER`, default the lane's own).

```sh
python3 docs/evidence/amend-booking/sabotage/sabotage.py \
  tests/database/amend_booking.test.sql docs/evidence/amend-booking/sabotage/breaks-s1.json
python3 docs/evidence/amend-booking/sabotage/sabotage.py \
  tests/database/change_departure.test.sql docs/evidence/amend-booking/sabotage/breaks-s2.json
python3 docs/evidence/amend-booking/sabotage/sabotage-run.py \
  "app.amend_reservation(uuid,date,date,uuid,integer,text)" \
  docs/evidence/amend-booking/sabotage/lock-old.txt docs/evidence/amend-booking/sabotage/lock-new.txt \
  -- pnpm exec vitest run --config vitest.integration.mts tests/integration/amend-booking.test.ts -t deadlock
```

## Slice 1 — changing a booking that has not arrived

`tests/database/amend_booking.test.sql`, 17 breaks (`breaks-s1.json`), each red:

| Break                                     | Went red                                   |
| ----------------------------------------- | ------------------------------------------ |
| no `front_desk.amend` check               | AB-S1-22                                   |
| reach alone, no commercial gates          | AB-S1-25 (a Property without a front desk) |
| no version check                          | AB-S1-19                                   |
| checked-in and cancelled bookings allowed | AB-S1-14, AB-S1-13                         |
| no today check                            | AB-S1-10, AB-S1-11                         |
| a Guest booking without a departure       | AB-S1-12                                   |
| a change that changes nothing             | its own assertion                          |
| a Unit at another Property not refused    | its own assertion                          |
| no in-service check                       | AB-S1-15                                   |
| re-price trigger dropped                  | AB-S1-03, AB-S1-24                         |
| re-price on every Unit change             | AB-S1-02                                   |
| re-price out of reach unprices silently   | its own assertion                          |
| append-only trigger dropped               | AB-S1-24 (never rewritten, never deleted)  |
| finished-row trigger dropped              | AB-S1-13 (for every role)                  |
| dates granted to `ranza_app`              | AB-S1-23                                   |
| revisions readable by everyone            | the other Organization reads none          |
| `INSERT` granted on `reservation_changes` | the grant shape only — see below           |

The last one is a guarantee behind a narrower one: with `INSERT` granted, the
insert is still refused because `reservation_changes` has no insert policy.
Row-level security is what binds; the grant assertion is what notices the
widening.

Integration (`tests/integration/amend-booking.test.ts`):

- Unit locks taken old-then-new with a 0.3 s pause (`lock-*.txt`) →
  `two_moves_between_two_rooms_do_not_deadlock` red with `40P01`.
- Version check removed (`ver-*.txt`) → `two_changes_to_one_booking_do_not_both_land`
  red: both landed.
- An arrival of today refused (`today-*.txt`) → `an_arrival_is_brought_forward_to_today` red.

Dialog (`tests/unit/change-booking.test.tsx`): the save guard, the first-read
refill, the pinned version and the per-save notice reset were each disabled in
turn, and each named test went red.

The migration was also built from its file on a throwaway database and every
suite run against it, not only against the lane database it was developed on.

## Slice 2 — changing an in-house Guest's departure

`tests/database/change_departure.test.sql`, 10 breaks (`breaks-s2.json`), each
red. The reach-only break was silent until a Property without a front desk was
added to the fixture; that assertion now names AB-S1-25 for slice 2.

The Stay's nights: re-dating the Stay's start alongside its end turned
AB-S2-07 red, so the "nights already spent" assertion compares something.

Integration:

- Version check removed (`dver-*.txt`) → `two_departure_changes_do_not_both_land` red.
- The Stay lock (namespace 1) removed alone (`dlock-*.txt`) stayed
  green: check-out and the command both lock the Stay row before the booking
  row, so either guard suffices. With both removed — no Stay lock and the
  booking row locked first — `a_departure_change_and_a_check_out_do_not_deadlock`
  went red with `40P01`. The migration's comment says which guards bind.

Two more breaks, after the slice-2 grill:

- `app.stays_keep_closed_days()` made to date an in-house Stay's end →
  "AB-S2-05, AB-S3-10: a Guest past their departure is extended … though that
  departure was on a day since closed" red with RZ001. The closed-day trigger
  not dating that change is what lets Extend work the morning after a close.
- `stays_update_front_desk`'s WITH CHECK given an `in_house` arm → "AB-S1-23:
  nor through the end check-out may write, while the Guest is in house" red.
  The policy's `else false` is what binds; the grant on `stays.ends_on` alone
  would allow it.

Dialog (`tests/unit/change-departure.test.tsx`): the cleared-departure guard
disabled turned "a Guest's departure cleared is asked for" red; the Resident
branch removed turned "a Resident's extension is not called free" red.

## Slice 3 — moving an in-house Guest

`tests/database/move_stay.test.sql`, 15 breaks (`breaks-s3.json`), each red:
the caller's permission and gates, the version check, a departed Stay, the
readiness check, another Property's Unit, a move to the same room, the booking
not following the Stay, readiness ignoring moves, readiness counting a move
between beds, the worker trusting the payload's room, the worker marking a
move between beds, the worker without the later-word guard, the stretches
ignoring where the last move went, and a checked-in booking re-priced by a
move.

Two findings the sabotage produced:

- The first worker break — the function also accepting a move found by the
  payload's claimed room — stayed green, because the claimed room had never
  been left. The break was rewritten to do what trusting the payload means,
  mark the room the payload names, and then went red.
- The stretches assertion went red under unrelated breaks: two moves of one
  Stay in one transaction share `now()`, and their order fell to a random id.
  No real sequence does that — each move holds the Stay's lock and commits on
  its own — so the suite moves a second Guest instead of moving one twice, and
  the function's comment says why the order holds.

Integration:

- Version check removed (`mver-*.txt`) → `two_moves_of_one_guest_do_not_both_land` red.
- Unit locks taken old room first (`mlock-*.txt`) →
  `two_guests_swapping_rooms_do_not_deadlock` red with `40P01`.
- The same break, and removing the old room's lock altogether, both left
  `a_move_and_a_check_in_into_the_room_left_do_not_deadlock` green: the move
  never waits on anything the check-in holds, so no cycle forms there. The
  test's comment says so; the swap is where the lock order binds.
- The calendar's per-room filter removed → `a_move_rewrites_no_night_already_spent`
  red.

Dialog (`tests/unit/move-guest.test.tsx`): Save's readiness guard and the
choice being cleared after another version were each disabled, and each named
test went red.

After the slice-3 review, four more database breaks, each red: readiness
counting moves of any day and readiness ignoring a room cleaned after the move
(the two clauses of the housekeeping lateral), a moved Stay allowed to be
withdrawn (AB-S3-11), and a damage charge reading only the Stay's current room.
In integration, the damage-charge picker without the moved-room lookup turned
"a moved Guest is still offered for a damage charge" red; in the unit suite,
the drawer's key and alias were covered by "follows a moved Guest to their new
room".

A move of one Stay twice in a transaction (A to B to A) is not asserted: the
two revisions would share `now()`, which no real sequence produces.

After the slice-3 grill:

- The audit search found a moved Guest's Stay by the room they left but not
  their booking, so their check-in was lost. The booking half now follows the
  revisions too; "the audit log finds a moved Guest by the room they left,
  check-in and all" went red with that clause removed.
- A refused move cleared the reason: React resets a form after its `action`,
  and Radix Select answers the reset by clearing a controlled value. All three
  change dialogs now submit without the reset (`lib/submit-without-reset.ts`,
  moved from maintenance). "a refused room keeps the reason and the note" was
  red on the old form.
- More database breaks, each red: readiness counting only moves out of the
  room itself (so a Guest moved from a bed to a room leaves nothing to clean);
  the move with no caller check at all (another Organization, a lapsed
  Subscription, no front desk, no permission); a closed-day rule that dates a
  move (the move of a Guest who arrived on a closed day failed). The worker
  marking the bed rather than its room is refused by housekeeping's own
  trigger before it can mark anything — that trigger is what binds there.
- Browser: Move from the room calendar's drawer, with the drawer following the
  Guest to the room they are in; with the bar key reverted to always carry the
  first night, the drawer stayed on the room left and the test went red.
