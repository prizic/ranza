# Rates rows that named tests which did not exist

Three approved rows in `docs/features/rates/edge-cases.csv` named a test that had not been written. Each is written below, was seen red with the behaviour it guards broken (the altered line printed first), and then green again with the code restored.

## RT-S2-10 — the Reservations list shows each price per night, or No price

Test: `tests/unit/reservation-prices.test.tsx`, "RT-S2-10: shows a priced booking's price per night and an unpriced one's No price". It renders `ReservationsTable` with one priced and one unpriced row.

Broken in `apps/operator-workspace/src/features/front-office/components/columns.tsx`, the `nightlyRateMinor` cell:

- The unpriced branch rendered nothing. Altered: the `<span>{t("bookedUnpriced")}</span>` was replaced with `null`. RED: `Unable to find an element with the text: No price`.
- The priced branch dropped the price. Altered: `price: formatMoney(row.original.nightlyRateMinor, …)` was replaced with `price: ""`. RED: `Unable to find an element with the text: TRY 125.00 / night`.

## RT-S2-11 — bookings taken before prices stay unpriced; nothing is backfilled

Test: `tests/database/rates.test.sql`, "RT-S2-11: a booking taken before its kind had a price stays unpriced; nothing is backfilled". The bed booking taken unpriced by RT-S2-03 is left in place. Beds are then priced (its own assertion, so the price provably existed), and the booking must still carry a null rate and currency. The plan went from 39 to 41.

Broken in a scratch copy of the suite (not committed): a `SECURITY DEFINER` trigger on `property_rates` that backfills every unpriced Guest booking of the kind that was just priced. The printed altered object:

    ALTERED: CREATE TRIGGER sabotage_backfill AFTER UPDATE ON public.property_rates FOR EACH ROW EXECUTE FUNCTION sabotage_backfill()

The `reservations_keep_their_price` trigger had to be disabled in the copy for the backfill to write at all, so the database already refuses a backfill from any role, and this assertion is the second wall behind that one. RED: `not ok 31 - RT-S2-11: a booking taken before its kind had a price stays unpriced; nothing is backfilled`. `not ok 33` (RT-S2-06, bypass role cannot change a price) also went red, which is collateral from disabling that trigger. The price-set assertion 30 stayed green, as it should.

## RT-S3-16 — a priced check-out leaves its balance with a reason

Test: `tests/unit/check-out-balance.test.tsx`. Two tests: "says payments cannot be taken yet and asks why the balance stays open", and its inverse, "a Guest who owes nothing is not asked for a reason". The first asserts the hint text (`checkOutBalanceHint`, with the formatted balance), a `required` reason field with `minlength` 3, and that the form is invalid empty, valid with a reason, and invalid again once cleared.

Broken in `apps/operator-workspace/src/features/front-office/components/check-out-dialog.tsx`:

- The hint removed. Altered: `{t("checkOutBalanceHint", { balance })}` was replaced with `{""}`. RED: `Unable to find an element with the text: Payments cannot be taken yet. The Folio stays open with TRY 250.00 on it…`.
- The requirement removed. Altered: `minLength={REASON.min}` and `required` were deleted from the reason `Textarea`. RED: the first test failed.
- The reason asked of everyone. Altered: `const owes = due !== 0;` was replaced with `const owes = true;`. RED: "a Guest who owes nothing is not asked for a reason" (`expected <textarea …> to be null`).

## What is not asserted

The "Folio stays open with the balance" half of RT-S3-16 is the module's behaviour (`checkOutStay` refusing a balance without a reason, and leaving the Folio open). It is not exercised by these unit tests, which mock the server action. The dialog's `required` attribute is the only thing these tests show blocking a submission. The server-side wall (a balance without a reason is refused, and left open with one) lives in `packages/ranza/reservations/src/module.ts:1006` and is asserted by `tests/integration/folios.test.ts:863`, which was not re-run for this change.

## RT-S3-11 — a reversed room night is not posted again

The assertion that named this row, "a posted night stays posted, reversed or not", asked about A's night of T-1, which nothing had reversed, and its fixture reversed G's night of T-2, which had never been posted (`INSERT 0 0`). It proved nothing about a reversal.

Tests, all in `tests/database/room_nights.test.sql`. Finance now reverses two of J's nights that were posted by check-out, T-3 and T-1, with the statement `reverseLine` in `packages/ranza/folios/src/module.ts` runs (a `reversal` line naming the charge, for minus its amount), as `ranza_app` under the Finance Staff Member's request context (`INSERT 0 2`). Then:

- "RT-S3-11: a reversed night is still posted": `room_nights_due` answers `already_posted` for the reversed night of T-3.
- "RT-S3-11: the close does not post a reversed night again, and the night and its reversal, which carries no date or mark, both remain": after the close of T-1, J's lines are exactly three room-night charges (T-3, T-2, T-1) and two reversals with no `source` and no `business_date`, each naming the night it cancels.
- "RT-S3-11: nor does check-out post a reversed night again": a second check-out for J posts `(0, 0)`.
- "RT-S3-11: after check-out J still has each night once, and both reversals": the same five lines.

The close can reach a reversed night only as one check-out posted before it: closes run contiguously from the day before the first one, so a closed day is never closed again (RT-S3-09 covers the refusal), and a night on a day before the first close is only ever check-out's. The plan went from 27 to 32, RT-S3-17's three included.

Broken inside one transaction around the suite (`begin; <break>; \i room_nights.test.sql`), which the suite's own `rollback` undoes:

- `room_nights_due` stops counting a reversed night as posted. Printed altered clause: `when exists (select 1 from public.folio_lines as line where … and line.business_date = night.day::date and not exists (select 1 from public.folio_lines as reversal where reversal.reverses_line_id = line.id)) then 'already_posted'`. RED: only `not ok 6 - RT-S3-11: a reversed night is still posted`. The posting assertions stayed green, and that is a finding: `folio_lines_room_night_key` is a unique index on the original charge's row, which a reversal leaves in place. So `on conflict … do nothing` refuses the second posting on its own. The two walls are independent, and each one alone keeps the night from being posted again.
- That break, plus `folio_lines_room_night_key` dropped and the `on conflict` clause removed from `app.post_room_nights` and `app.post_room_nights_for_departure`. Printed: the same clause, `room_night_key_indexes = 0`, and `position('on conflict' …) = 0|0` for the two functions. RED: 6, 13 and 15 (collateral, the close's own lines and totals), 18, `not ok 14` (the close, `have: (charge,room_night,-1,,10000)` a second time), `not ok 28` (check-out `have: (1,10000)`), `not ok 29`, plus RT-S3-02's catalogue and 23505 assertions.
- The key and the `on conflict` clauses removed, with `room_nights_due` intact. RED: RT-S3-02's 2 and 21, and 29. The red on 29 is collateral, not a second posting. RT-S3-02's "nor twice … whoever writes it" insert succeeded with no key, and it put a second T-2 charge on J. The RT-S3-11 posting assertions 14 and 28 stayed green, because `already_posted` holds.

Afterwards the database was confirmed unchanged: the index is present, `room_nights_due` holds no `reverses_line_id`, and `on conflict` is present in `post_room_nights`. The suite ran green.

## RT-S3-17 — where billing is not available, the close lists the night and writes nothing

Before this change the test only asked `room_nights_due` for a reason. It never ran a close, and never looked at the Folio. Test, `tests/database/room_nights.test.sql`: a second Property of the same Organization, "Night Unbilled Property", with `front_desk` on and `finance` off. Its Stay L is a priced Guest in house from the day before that Property's own today, with an open Folio. A fixture assertion shows L's booking is priced at 10000, so that only billing stands between it and a charge (`unpriced` is asked before `billing_unavailable`). The manager closes the day before its today through `business_day_closes`, so the stamp posts through `app.post_room_nights`. Then:

- "RT-S3-17: where billing is not available, a night is listed and not charged": the close row reads `(0, 1, [{"stayId": L, "reason": "billing_unavailable"}])`.
- "RT-S3-17: and the close writes no line on that Guest's Folio": the count of lines on L's Folio is 0.

Broken the same way: the `when not app.capability_is_available(stay.property_id, 'billing_folios', 'finance') then 'billing_unavailable'` branch removed from `room_nights_due`. Printed: `billing_check_pos = 0`. RED: `not ok 31` (`have: (1,0,[])`) and `not ok 32` (`have: 1`), and nothing else. Afterwards the function holds the check again.
