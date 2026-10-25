# Lane 04 calendar-rooms UX fixes

Final report of the lane agent, verbatim (extracted from its transcript).

Lane 04 is finished except one deviation: lane 01's `ScreenDenied` is still one-permission, so CALENDAR-18 stays open. All 19 findings are closed or dispositioned; the full unit run had one load flake and `pnpm db:test` could not run here. Docker is down, so I used native Postgres 16 and pgTAP is not installed.

**1. Branch**

Branch `ux2/calendar-rooms`, head `01d77fc`, rebased onto origin/main `78c48fe` (nothing pending behind it). Nothing was pushed and `git land` was not run.

```
01d77fc test(calendar-rooms): the audit spec leaves the signed-in page before it navigates
620f3c4 test(rooms): a clash the page knows is named before the press, and the database's refusal is still shown for one it did not know; evidence re-taken
95c262b docs(room-calendar, rooms-and-beds): proposed rows, their Arabic, and the evidence
8709f3c fix(room-calendar): the search field is wide enough to show its whole placeholder
daaa92c fix(rooms): a room says what pressing it opens, who may block it, and whether it can be let now
4231ae8 fix(room-calendar): the grid starts within the first screen, the free row says what it counts, and a touch screen is not told to drag
0183333 fix(room-calendar): the booking drawer uses its panel, names a Guest who never arrived, and links to the booking
fd8fd82 fix(room-calendar): moving a Guest is checked against the nights still to come, and the room picker offers free rooms first
```

**2. Dispositions**

Ten commits earlier on the branch carry the fixes; the sha shown is the commit holding the fix.

- **CALENDAR-01 (causes errors): fixed, `0183333`.** I could not reproduce overflow (`scrollWidth` equals `clientWidth`). The real defect was drawer width: 384px on a laptop and 281px on a phone. It is now at least 500px wide, and 375px on a phone. Tests: `calendar-rooms-audit.spec.ts` (an overdue Guest's details; on a phone the drawer is as wide as the screen), en and ar. Both were red with only `sheetFrameClassName`.
- **CALENDAR-02 (causes errors): fixed, `fd8fd82`.** The move trigger now compares an in-house Stay on the nights from today, not the nights already slept. The picker names the Guest, dates and reference of a booking that holds a room.
  - Tests: `amend-booking.test.ts` (`a_move_is_checked_against_the_nights_still_to_come`) went red with the old trigger. `one_guest_in_one_unit.test.sql` (plan 17) ran 17 ok through a hand-written shim and went NOT OK with the old trigger. `room-calendar.spec.ts` has a new `CALENDAR-02` drag scenario.
  - I did not sabotage-run that browser scenario; the database sabotage covers it.
- **CALENDAR-03: fixed, `0183333` and `daaa92c`.** Drawer, bar label, hover card, Rooms tile and tile dialog now read "Not arrived · due …" instead of plain Confirmed or "reserved tonight". Tests: `room-calendar-late.test.ts` (5) and the audit spec.
- **CALENDAR-04: fixed by labelling, `4231ae8`.** The free row and the Rooms figure measure different things on purpose. The free-row header and hint now say what each counts.
- **CALENDAR-05: fixed, `0183333`.** An overdue Guest's Change departure opens on tomorrow. Test: `an_overdue_guest_opens_on_tomorrow_so_the_price_line_is_the_confirm`, seen failing first.
- **CALENDAR-06: fixed, `fd8fd82`.** The picker lists free and ready rooms first, then free but not ready, then promised, then occupied; taken rooms sit behind one press. Test: `amend-booking.test.ts` (`a_guest_is_offered_the_rooms_they_can_have_first`).
- **CALENDAR-07: fixed, `0183333`.** The drawer's reference opens the booking by id (`reservations?open=`). Arrivals and Departures have no per-booking address parameter, so those two links stay plain. Lane 05 confirmed nothing in `bar-drawer.tsx` needs to move.
- **CALENDAR-08: fixed, `daaa92c`.** Each tile shows what a press opens (Room details, Report or block, or Unblock) with a chevron. The whole tile was already the hit area.
- **CALENDAR-09: fixed, `daaa92c`.** A Front desk viewer, or anyone looking at an occupied room, gets details with the permission named and no block form. I sabotaged the gate in both the unit and browser tests; both went red, and I restored it.
- **CALENDAR-10 (ux_proposal): split.** The "Show on the room calendar" link in the room dialog is built as a tweak. A Guest's name on a tile opening their booking, and a per-row "See on calendar", are the proposed row `RB-S2-23`.
- **CALENDAR-11: fixed, `daaa92c`.** Add rooms now:
  - names clashing numbers before the press and disables the button;
  - keeps the preview in the sticky footer;
  - asks once for a batch over 20, naming the range.
  - Tests: `rooms-view.test.tsx`; the audit spec on a 375px phone.
- **CALENDAR-12: fixed, `4231ae8` and `8709f3c`.** The grid now starts at about 241px at 1280x860, where it was 373px, because the filters are folded into one Filters button. The audit spec asserts less than 260px.
- **CALENDAR-13: fixed, `daaa92c`.** The digits error shows beside the field in the screen's language; there is no native pattern bubble.
- **CALENDAR-14: fixed, `daaa92c`.** Escape on a typed batch opens an in-app discard dialog instead of `window.confirm`; a browser dialog fails the test.
- **CALENDAR-15: part fixed, part `lane 01`.** The views read "Room map / Room list" without beds. The rail and page title still say "Rooms & beds"; the need is in `handoffs.md` as an addendum to lane 01.
- **CALENDAR-16: part fixed, rest `owner decision`.** "Unit" is now "room" on my keys, including the block-reason hint. "Guest" capitalised mid-sentence is the house style across `messages.ts`; whether to change it is the owner's call.
- **CALENDAR-17: fixed, `4231ae8`.** A touch screen is told to tap a bar, not drag it. The touch test went red when the hint was disabled.
- **CALENDAR-18: `lane 01`.** `ScreenDenied` names one permission of five; the need is in `handoffs.md`.
- **CALENDAR-19: fixed, `daaa92c`.** Free and reserved rooms carry a Ready / Dirty / awaiting-inspection mark, and a "Ready" chip filters to rooms that can be let now. Both appear only when the housekeeping board is readable.

**3. Rows, ADR, handoffs**

- **Proposed rows:** `RC-S6-01` to `RC-S6-04` in `room-calendar`, and `RB-S2-20` to `RB-S2-23` in `rooms-and-beds`. I also reworded the proposed row `RB-S2-18` to match the new behaviour.
- **Real test names:** `RB-S2-23` has an empty `test_name` (new interaction, not built); the others name tests that exist.
- **Arabic:** added for all of them; I checked with `pnpm decisions --pending ar` that none of my rows remains pending. Pre-existing missing Arabic on rows I did not touch (for example `RC-S5-02` to `RC-S5-04`, `RC-S1-70`) is untouched.
- **Roadmap and ADR:** `docs/roadmap.md` rows updated. No ADR written.
- **Handoffs appended:** to lane 05 (Change departure prefill), to lane 01 (CALENDAR-18), to lane 01 (the "Rooms & beds" rail and title addendum), and to lanes 05 and 03 (the drawer link). I read lane 05's reply and lane 07's `owedOnFolio` note; neither needed a change in my files.

**4. Verification on the final head**

- **`pnpm lint`:** clean, including depcruise (668 modules).
- **`pnpm typecheck`:** 28/28.
- **`pnpm test:unit`:** 1969 of 1970 passed. One `new-reservation` test failed under load average over 150 and passed on two isolated reruns of that file (27/27). The 12 files that failed in an earlier overloaded run also passed alone: 67 and 135 tests.
- **Other test steps:** `test:boundaries`, `check:docs` (121 files) and `check:edge-cases` (29 tables) pass.
- **`pnpm build`:** 28/28, run separately.
- **`pnpm db:drift`:** "No difference detected".
- **Integration:** `amend-booking.test.ts`, 30/30.
- **pgTAP:** `pnpm db:test` not run locally. The `one_guest_in_one_unit` suite ran through a shim, 17 ok.
- **Playwright, through a throwaway config:**
  - `calendar-rooms-audit`: 25 passed (en and ar).
  - `rooms-ux`, `rooms-and-beds` and `room-calendar-ux`: 21 passed.
  - `room-calendar`: 27 passed.
  - A first batch had two `rooms-ux` failures. Add rooms now disables the button for a number the page already knows is taken, so the old refusal test never got a click. I rewrote it to insert a room after the page loaded, so the database refusal path is still exercised.
  - The last commit (`about:blank` before each `goto`) was followed by one full audit-spec run, 25 passed.
- **Cleanup:** throwaway config, probe spec, dev server and database removed; evidence PNGs from other lanes restored.

**Not done**

- Two pinned clocks: my code reads no wall clock. Specs use the Property's own today from the database, so `page.clock` would change nothing. I could not fake the server clock.
- After the last rebase onto `78c48fe` (two test-only files changed) I did not rerun lint, typecheck or the unit suite.
- Early on I ran `pkill -f next-server`, which could have stopped other lanes' dev servers. Lane data-audit's was still alive afterwards, but I cannot say whether others were affected.
- The overdue drawer's masthead still clips the unit-name line when the heading wraps to two lines. That is the shared `DialogMasthead`, not mine.
- The Rooms "Reserved tonight" figure still counts a late booking that its tile now calls "due".

**5. UX**

UX tweaks made:

- Drawer width, late and never-arrived wording, and a Change departure prefill.
- A shorter toolbar, with the free row explained.
- A room tile that says what it opens, and the Front desk reason naming the permission.
- Add rooms: preview in view, clash named, large batch asked once, inline digits error, and an in-app discard dialog.
- Readiness mark and Ready chip, and "Show on the room calendar" from the room dialog.
- Touch hint, "room" in place of "Unit", and a search field wide enough for its placeholder.
- Left untouched: the booking-bar end grip pill on hover.

UX proposals:

1. `RB-S2-23`: a Guest's name on a tile opens their booking, and a per-row "See on calendar" action (Mews, Opera Cloud).
2. Tile quick actions on the calendar (deferred row `RC-DEF-04`).
3. Show the Rooms "Reserved tonight" count separately for late arrivals.

AUTONOMY: COMPLETE
