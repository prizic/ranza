# Lane 03 reservations UX fixes

Final report of the lane agent, verbatim (extracted from its transcript).

Branch `ux2/reservations`, head `1062505` (8 commits above origin/main `e156cb2`; the base had not moved, so there was no rebase). All 18 findings have a disposition. Seven are fully fixed and the rest are partly fixed, proposed, or handed to another lane (table below).

```
1062505 test: the reservations search box is found by its role
8c35839 fix: the audit log names a picked Guest; unit tests follow the new strings
b0b53a9 style(ui): format the stay ruler
c2cc9d5 test: the change departure ruler is labelled at equal gaps, with its screenshot
9756f36 docs: rows for the audit's fixes and three proposed interactions, with Arabic
7cac0d0 test: a picked Guest of another Organization is refused even to somebody who reaches both
e4282e4 fix: late bookings named and sorted first, no-show way out, focus return, consistent wording
b6c9efa fix: a returning Guest is found without accents or by telephone; a picked Guest is booked onto by id
```

## Dispositions

| ID              | Disposition                                                                                                                                                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RESERVATIONS-01 | **fixed**, b6c9efa. Found at the module: suggestions fold accents and case, match the last 10 digits, and also run from the phone field. Booking now takes `existingGuestId`, which is refused for another Organization's Guest. Integration tests: 4 of 5 fail on origin/main's `module.ts` and pass now. |
| RESERVATIONS-07 | **fixed**, e4282e4. New Overdue tab holds overdue stays and bookings whose arrival passed, and the chip reads "Did not arrive · N days" with the due date. Unit tests.                                                                                                                                     |
| RESERVATIONS-11 | **fixed**, b6c9efa. The footer actions wrap and the form is `grid-cols-1`. Playwright at 375 px goes red without the wrap fix.                                                                                                                                                                             |
| RESERVATIONS-02 | **fixed in part**, b6c9efa. The form shows the night count, "N of M units free for these nights", and a nightly price on each unit row. Unit-type chips are **proposed** (RG-DEF-12).                                                                                                                      |
| RESERVATIONS-03 | **fixed**, b6c9efa. The price quote is in the sticky footer beside the button.                                                                                                                                                                                                                             |
| RESERVATIONS-05 | **fixed**, e4282e4. Focus returns to the row's menu button. Playwright goes red without the effect.                                                                                                                                                                                                        |
| RESERVATIONS-06 | **fixed**, e4282e4. A late booking opens Change booking with a "was due" notice and a Mark as no-show button, not a red error.                                                                                                                                                                             |
| RESERVATIONS-08 | **fixed**, e4282e4. A requested booking says to cancel it and book again. The in-house row menu gains "Check out (opens Departures)".                                                                                                                                                                      |
| RESERVATIONS-09 | **fixed**, e4282e4. The note is three lines at most, the year is dropped when it is the Property's own, and the chip is whole at 1440 px.                                                                                                                                                                  |
| RESERVATIONS-10 | **lane 01.** Card layout below 768 px belongs to the data table; handoff written.                                                                                                                                                                                                                          |
| RESERVATIONS-12 | **fixed**, e4282e4. Departing today is strictly due today; overdue stays are under Overdue.                                                                                                                                                                                                                |
| RESERVATIONS-13 | **fixed in part.** The Check out link to Departures is built. In-place check-out and a balance on the row are **proposed** (RG-DEF-13), and the balance waits on lane 07's "owed" function and RANZ-56. Handoff to 07 written.                                                                             |
| RESERVATIONS-14 | **fixed**, 7cac0d0/c2cc9d5. `rulerLabelStep` gives equal gaps and a label on the last day. Unit test goes red without it, plus a screenshot.                                                                                                                                                               |
| RESERVATIONS-15 | **fixed in part**, e4282e4. The list opens in attention order. Remembering the last tab and page size is **proposed** (RG-DEF-14).                                                                                                                                                                         |
| RESERVATIONS-16 | **fixed at desktop widths**, e4282e4. The placeholder is "Name, room, phone, date" and reads whole at 1280 px. The 375 px remainder is **lane 01**.                                                                                                                                                        |
| RESERVATIONS-17 | **lane 01.** The `screen-denied` copy sits with role page access; handoff written.                                                                                                                                                                                                                         |
| RESERVATIONS-18 | **fixed**, e4282e4. Turkish uses "birim" throughout and the Arabic guest-name label is corrected.                                                                                                                                                                                                          |
| RESERVATIONS-04 | **fixed**, b6c9efa. Email and telephone each have their own hint.                                                                                                                                                                                                                                          |

## Rows, ADR, handoffs

- **Rows** in `docs/features/reservations-and-guests/edge-cases.csv`, all `proposed`:
  - Changed: RG-S4-03, -08, -20, -21, -24.
  - New: RG-S4-28 to -36, and RG-DEF-12 to -14 (the three proposed interactions).
  - Comparable systems for the proposals:
    - RG-DEF-12 (unit-type chips): Mews, Cloudbeds.
    - RG-DEF-13 (in-place check-out and balance): Opera Cloud, Mews.
    - RG-DEF-14 (remembered tab and page size): Cloudbeds, Apaleo.
  - I did not edit the approved RG-S1-18. A desk pick is staff review, not an automatic merge, and its test still passes.
- **Arabic** entries for all of the above are in `docs/decisions/ar/reservations-and-guests.json`.
- **ADR:** none. **Migrations:** none.
- **Handoffs** appended to `goals/2026-10-25-ux-audit-fixes/handoffs.md`: to 01 (card layout, search box at phone width, denied-page copy, search input lacks an `aria-label`) and to 07 (owed figure and in-place check-out).
- **`docs/roadmap.md` not edited.** Prettier re-pads the whole table when row 115 grows, which would conflict with other lanes. The existing sentence there is still true; the new behaviour is in the csv rows.

## Verification (final tree)

- `pnpm check`: exit 0. Format, lint (no dependency violations), typecheck, 132 unit files / 1827 tests, boundary checks, docs check, edge-case check (29 tables), build 28/28.
  - One run before this passed had a single unit failure in `new-reservation.test.tsx` under load 19. The file passes alone, 5 of 5 runs, and the next full `pnpm check` was clean. I did not find the cause, only that it passes alone.
- Integration `booking-and-check-in` and `front-office`: 105 of 105.
- Playwright through a throwaway config:
  - `ux-reservations`, `ux-front-desk` and `reservations.spec`: 44 tests passed.
  - `amend-booking`: 5 passed.
  - `front-desk-rows`: 10 passed.
  - `room-calendar` RC-S3-01: 1 passed.
  - `amend-booking` and `room-calendar` first failed because they find the search box by the word "search". I changed them to `getByRole("searchbox")` and re-ran them.
- Sabotage runs, each shown red and then restored:
  - Departing and Overdue tab logic: unit tests red.
  - Stay ruler step: unit test red.
  - Focus-return effect: Playwright red.
  - Footer wrap: Playwright red. `grid-cols-1` alone did not go red, so it is defensive only.
  - Picked-Guest Organization clause: first sabotage gave no red, because row-level security hides the other Organization's Guest. I added a manager of both Organizations to the integration fixture, and the clause now fails the test without it.
- Not run: `pnpm db:test` (pgTAP is not installed natively; no migration or policy was touched) and `db:drift`. The full `pnpm test:browser` was also not run, as instructed.
- `pnpm --filter @ranza/db generate` ran before the checks. The base did not move, so there was no rebase.

## Beyond the findings, and not done

- `guestChosen` is labelled on the audit log in en/tr/ar. The audit-writers test requires every recorded key to be named.
- Unit tests updated for the late-booking notice, year-less stay days and the new strings.
- Evidence PNGs from my runs are committed under `docs/evidence/ux-audit-2026-10-24/reservations/` (all under 400 KB, and I looked at each). The ones `test:browser` overwrote elsewhere were restored.
- Throwaway config, seed script, dev server and native database are removed.

UX tweaks made: attention-ordered list, Overdue tab and "Did not arrive" chip, picked-Guest banner with a way out, night count, free-unit count and nightly prices before choosing a unit, quote beside the confirm button, focus return, no-show offered from a late booking, Check out link to Departures, equal-gap stay ruler, shorter search placeholder, consistent Turkish wording.

UX proposals, ranked: 1. In-place check-out with the balance (RG-DEF-13, after lane 07's owed function). 2. Unit-type chips with per-type free counts (RG-DEF-12). 3. Remember the last tab and page size (RG-DEF-14).

AUTONOMY: COMPLETE
