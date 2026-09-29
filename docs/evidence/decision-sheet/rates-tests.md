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
