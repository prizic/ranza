# Lane 12 shell orphans follow-up

Final report of the lane agent, verbatim (extracted from its transcript).

## Lane 12 (shell-orphans) report

All four open items now have a disposition. Three of the code changes have tests that pass. Branch `ux2/shell-orphans`, head `bb29ac1`, 0 commits behind and 5 ahead of origin/main `a678d6c`. Not pushed, no `git land`.

### Dispositions

- **CALENDAR-18 (04→01): fixed.**
  - The denial returned by `explainDenial` (`@ranza/core`) now carries `anyOf`, the list of every permission that would open the page. It is set only when the screen accepts more than one.
  - `ScreenDenied` lists them all in the People screen's wording, set off by each language's own quotes.
  - Housekeeping on `/room-calendar` now reads: "opens for a role that holds any of “Take a booking”, “Check somebody in”, …, and yours holds none of them".
  - A page that one permission opens still names that one.
  - Tests:
    - unit `screen-denied.test.tsx` (en, tr, ar, plus the single-permission case);
    - integration `screen-denial.test.ts` DENY-08b (19/19 pass);
    - browser `shell-orphans.spec.ts` (Finance and Housekeeping on the room calendar, Finance on Rooms in Arabic).
  - I disabled the rendering in a scratch edit and the three CALENDAR-18 unit tests went red; I restored it afterwards.
  - Not done: a link to the "nearest page the role has". That needs an invented ordering and a new context from the layout. The refusal keeps "Go to Today", and the chips or sidebar on the same screen already list the role's pages.
- **CALENDAR-15 (04→01 addendum): fixed.** I picked a rule, not a per-Property label.
  - The rail entry, the page bar title and every link that names the page now say "Rooms" (tr "Odalar", ar "الغرف").
  - The shell does not know whether a Property lets beds. A conditional label would add a read to the layout on every page and a flag threaded through the rail, dock, bar and titles, all for one word.
  - Inside the page the words follow the Property: the list column and the subtitle say "Rooms" and name no beds when no room is let by the bed.
  - Tests: `rooms-view.test.tsx` (new test), `room-calendar-live.test.tsx` (updated link text), and the rail and h1 in `shell-orphans.spec.ts` in en and ar.
  - Trade-off to know: on a hostel-style Property the rail no longer hints at beds.
- **CONFIGURATION-17 (09→01): proposed.**
  - Approved row OA-S2-15 puts Security in the account menu, not the rail, and a unit test pins that. I did not add a rail entry.
  - New proposed row OA-S5-29: a one-line nudge on Today to an Owner or Manager whose two-step is off. Comparables are Mews and Cloudbeds, from memory and not re-checked.
  - No role-to-page access was changed.
- **05→01 (ARRIVALS-16): partly fixed.**
  - The wrong "Take a booking" on Departures and Arrivals is gone, by the same permission-list change.
  - Not done: naming the role that does the job (Front desk, Manager, Owner). Organizations compose their own roles, so a fixed name would be wrong for custom ones.
  - The permission label shown is the one the People screen shows, so that part of the ask is already met.
  - The `ArrowButton` chip and data-table notes were informational and needed no action.
- **07→01:**
  - FINANCE-07 (chips on a phone): fixed. Centring the current chip already existed (SHELL-15). I added the edge fade (`NavChips` now uses the existing `useScrollEdges` hook). Tested at 375 px in en and ar (start and end edges in RTL).
  - FINANCE-05 (list state in the address): proposed. It is the same need as HK-S1-38 and the deferred row FO-DEF-14, so it needs an approved row and I added none.
- **Other `from 0x to 01` blocks:** 02, 03, 06 and 08 were all answered by lane 01's replies. Nothing else was left open.

### Commits (origin/main..HEAD)

- `01ddd90` fix(shell): a refusal for a page that any of several permissions opens lists them all
- `b6f3284` fix(rooms): the rail, the page bar and the links call the page Rooms, and its list and subtitle name beds only where a room is let by the bed
- `e4d3c28` fix(shell): a row of page chips fades the edge that has more chips beyond it
- `c64fab0` test(shell): the refusal, the Rooms label and the chip fade through the browser, with the proposed rows
- `bb29ac1` test(shell-access): the Finance refusal spec accepts the new sentence. My change had turned this previously passing spec red.

### Verification on the final tree

Same code as `bb29ac1`; the last commit only changed one test regex.

- `pnpm check`: exit 0. That covers format, lint, typecheck, 146 unit files with 2034 tests, boundaries, docs, edge-cases and build.
- `tests/browser/shell-orphans.spec.ts`: 12/12 pass.
- `shell-access.spec.ts` plus `screen-access.spec.ts`: 29 pass and 1 failed, the Finance refusal wording. I fixed that test, and its two cases pass (6/6 including seed). I did not re-run the full pair afterwards.
- `screen-denial.test.ts` integration: 19/19 pass.
- `db:test` and `db:drift`: not run, because there is no schema, policy or grant change.
- I did not run the sabotage for the nav-chips fade or the Rooms label. Without the change the asserted attribute or text does not exist.

### Rows

- Added to `docs/features/organization-and-access/edge-cases.csv` and the Arabic file, all `proposed`:
  - OA-S5-26: the refusal lists every permission.
  - OA-S5-27: the Rooms label rule.
  - OA-S5-28: the chip fade.
  - OA-S5-29: the Security nudge on Today (new behaviour).
- They were renumbered after lane 11 took OA-S5-25. `pnpm check:edge-cases` passes.
- No ADR and no migration.

### Cleanup

I deleted `playwright.orphans.config.ts` and `test-results`, stopped the dev server on 55573, and removed the native DB cluster. `git restore docs/evidence` left the tree clean.

### UX tweaks and proposals

UX tweaks made:

- The refusal names every permission that would open the page.
- The page is called "Rooms" everywhere it is named.
- The Rooms list column and subtitle name beds only where a room is let by the bed.
- The page chips fade the edge that has more.

UX proposals, ranked:

1. A Today nudge for Owner or Manager with two-step off (OA-S5-29). Comparables: Mews, Cloudbeds.
2. A refusal that links to the role's nearest page. This is not a row yet. Opera Cloud and Apaleo send a role to its default page.
3. List state in the address (HK-S1-38 and FO-DEF-14).

Evidence PNGs are in `docs/evidence/ux-audit-2026-10-24/shell-orphans/`, all under 400 KB.

AUTONOMY: COMPLETE
