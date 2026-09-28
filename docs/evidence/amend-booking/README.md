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
