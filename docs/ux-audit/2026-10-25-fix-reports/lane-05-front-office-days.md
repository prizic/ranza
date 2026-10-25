# Lane 05 front-office-days UX fixes

Final report of the lane agent, verbatim (extracted from its transcript).

## Lane 05 `front-office-days`: FIX-BRIEF

**1. Branch** `ux2/front-office-days`, head `57551c5`, 10 commits on a678d6c. Local `origin/main` is now `bb29ac1`, 5 shell and rooms commits ahead. Only `messages.ts` overlaps, so a rebase should be trivial. I did not chase it after your "finish now". Nothing is pushed or landed, and no commit carries attribution.

```
57551c5 fix(front-office): the action column keeps its cells mounted when the list stacks or unstacks
9de22a7 test: drop the menu-stays-open spec (it passed without the margin it was written for)
61a6ffd fix: a stacked list keeps its columns until there is room to spare, says when it has measured itself
a46c9bd test: a reader with no Finance page is offered no Folio link
0529077 test: the audit specs open each page from a blank one
74cf639 fix(check-out): the dialog asks the one definition of what a Guest owes (owedOnFolio)
23c6ce8 test: the row menus list Open reservation first
f96da71 style: format the files the audit lane touched
066e0da docs: rows for the audit fixes and proposals, with Arabic and evidence
07c07c2 fix(front-office): the audit's Arrivals, Departures and Close the day findings
```

**2. Dispositions.** Every ARRIVALS-ID has one. The test for each fix is in `front-office-days.spec.ts` (EN and AR) unless noted.

| ID  | Disposition                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | fixed (07c07c2, c3e2902 and 57551c5; `row-actions-reachable` at 4 widths, EN and AR)                                                                                                                                   |
| 02  | fixed (07c07c2; guest cell clamps at 375px)                                                                                                                                                                            |
| 03  | fixed (07c07c2; "did not arrive" said once, `ArrivalLateness`)                                                                                                                                                         |
| 04  | fixed (07c07c2; reach-gated name and balance links, Finance-less reader test a46c9bd)                                                                                                                                  |
| 05  | fixed (07c07c2, 23c6ce8; menu hidden when empty, "Open reservation" first; `front-desk-rows`)                                                                                                                          |
| 06  | `proposed`: CO-S1-41, record a payment in the check-out dialog (Mews, Cloudbeds)                                                                                                                                       |
| 07  | fixed (07c07c2; Change departure opens on one more night, priced; unit test plus `amend-booking`). The +1/+2 night chips are `proposed`.                                                                               |
| 08  | `not built` (CO-NB-04). The message already tells the desk what to do, and "Open reservation" is the way there.                                                                                                        |
| 09  | fixed (07c07c2; check-out dialog says once it is final)                                                                                                                                                                |
| 10  | fixed on Arrivals (missed bookings listed, flagged, no check-in, mark no-show or cancel). The Today attention-list half is lane 02's. Integration test `lists a booking whose nights have all passed only when asked`. |
| 11  | partly fixed ("only" shown only beside Close all, all waiting days listed). `proposed`: CD-S4-09, close all under one reason, which reverses CD-S4-02, so the owner decides.                                           |
| 12  | fixed (07c07c2; warning first, separate charges notice)                                                                                                                                                                |
| 13  | fixed (07c07c2; "Room" wording across the dialogs; move-guest took upstream's `moveGuestRoomFact` on conflict)                                                                                                         |
| 14  | fixed (07c07c2; one filter row, no-match hint)                                                                                                                                                                         |
| 15  | fixed (07c07c2; focus goes to the next row's Check out after one is done)                                                                                                                                              |
| 16  | `lane 01` (arrow chip contrast fixed in `dialog-frame.tsx`; copy and phone-table handoff written)                                                                                                                      |
| 17  | fixed (07c07c2; nothing-charged and nothing-owed wording)                                                                                                                                                              |
| 18  | `already fixed` on main (Copy reference out of tab order); the focus half is done under 15                                                                                                                             |
| 19  | fixed (07c07c2; "Room" wording and empty-menu handling)                                                                                                                                                                |

**3. Rows, ADR, handoffs.**

- Rows, all `proposed`, with Arabic in `docs/decisions/ar/*.json`: FD-S8-12..16, CO-S1-38..41, CD-S4-07..09, AB-S2-09. `docs/roadmap.md` row 115 extended.
- No ADR and no migration.
- Evidence: 6 PNGs of 200 KB or less, in `docs/evidence/ux-audit-2026-10-24/front-office-days/`.
- Handoffs written: 05 to 01, 05 to 04 (two entries, the last this turn), 05 to 02, 05 to 07 and 04.

**4. Verification on 57551c5** (`/tmp/fod-check.log` has the `pnpm check` output)

- `pnpm check` passed, exit 0:
  - format clean
  - lint, typecheck and boundaries pass
  - unit tests: 146 files, 2030 tests passed
  - docs check: 121 files
  - edge-case check: 29 tables
  - build: 28/28 tasks
- A separate `pnpm build` on the previous head (before the final rebase) passed 28/28; the build inside `pnpm check` covers the final head.
- Integration, run on the head before the final rebase, because the DB was torn down by the restart:
  - front-office plus housekeeping: 108 passed
  - close-the-day, expected-arrival and business-day-closer: 42 passed
- Playwright on a fresh DB, foreground, in 3 batches:
  - `front-office-days`: 18 passed (the 4 seed tests are included in each batch's count)
  - `row-actions-reachable`, `front-desk-rows`, `amend-booking`: 25 passed
  - `close-the-day`, `ux-front-desk`, `housekeeping`: 38 passed, 1 failed
- The failure is `ux-front-desk.spec.ts:306`, and it is not mine. Lane 04's 12f586b makes the dialog open an overdue Guest on tomorrow, while the older RANZ-61 spec still expects "Pick the day they now leave". Both read that way on a678d6c, so it fails without my branch. I handed it to lane 04 and changed neither file.
- `db:test` not run locally, no migration touched. `db:drift` is not applicable.
- **Sabotage runs:**
  - Arrow chip: reverting the chip class turns the contrast spec red.
  - Missed-bookings flag: removing `withMissed` turns the integration test and the route unit test red.
  - Stable action column: before 57551c5, `housekeeping.spec.ts:325` ("has not been cleaned yet" lost on the layout flip) failed. After it, that spec and `ux-front-desk:691` pass. I did not re-run a revert of 57551c5 afterwards.
  - The hysteresis margin in `use-overflowing.ts` is **unverified**: the spec written for it passed with `HYSTERESIS = 0`, so I deleted it.
- Not run: `one-heading.spec` (times out compiling every rail route under the dev server on this loaded machine). The machine was at load average 80 to 120, and 3 specs timed out on sign-in until the machine was quiet, then passed.
- One earlier `amend-booking:297` failure came from my own integration runs closing yesterday on the shared test property. It passed on the fresh DB.

**5. UX tweaks beyond the findings**

- The arrow chip stays readable in all dialogs.
- "Room" wording is consistent across dialogs.
- Guest name and balance are links, gated by reach.
- Empty row menus are hidden.
- Focus moves to the next row after a check-out.
- Departures has one filter row and a no-match hint.

**UX proposals, ranked**

1. Record payment in the check-out dialog (CO-S1-41).
2. Close all waiting days under one reason (CD-S4-09, owner decision).
3. +1 and +2 night chips on Change departure.
4. Per-day item names on Close the day.
5. Phone card layout, which lane 01 owns (OA-S5-22).

**Not done or caveats**

- The first paint renders the full row, then stacks it once hydration measures the width. A brief flash is possible.
- I cannot pin the system clock, so all dates in the specs derive from the Property's own today.
- The branch has not been re-verified on `bb29ac1`.
- Cleanup is done: no untracked files, evidence PNGs restored, DB cluster and dev server removed.

AUTONOMY: COMPLETE
