# Lane 13 CI green on main

Final report of the lane agent, verbatim (extracted from its transcript).

## Lane 13 `ci-green`: report

Every failure I found on CI `main` is fixed on branch `ux2/ci-green` (worktree `/Users/pcx/Developer/ranza-ux2-ci-green`, head `4b6b85f5`, 10 commits on top of origin/main `4d84d8a`). Nothing is pushed or landed. A final local run of the touched specs, 2× each (7 files, 156 tests), was all green.

I could not confirm anything on CI itself. Run 40188966359 (`4d84d8a`) was still in progress when I stopped, so it is unchecked. The newest finished run, 40187308872, was red before my fixes.

### Root cause per test

| Test                                                  | Cause                                                                                                                                                                                                                                     | Fix                                                                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **today-ux:324** (gap 80 vs 24)                       | Code. The Radix Select trigger was empty on first paint, then filled with name plus hint on two lines. That re-wrapped the Today header by 56 px between the two measurements.                                                            | `layout-switcher.tsx` renders `<SelectValue>` with an explicit name. Reverting it reproduces `"OverviewWhat needs attention…"` locally. |
| **housekeeping-services-ux:51** (bar 134 vs <130)     | Code. The select-all link button's padding left only about 11 px of slack at 375 px. It wrapped to a third row at 360 px, which reproduced 134 px exactly.                                                                                | `max-sm:px-0` in `data-table.tsx`, and the test now also checks 360 px.                                                                 |
| **today-audit-fixes:437** (TODAY-21, +26 px sideways) | Code and test. The arrival card's "Clean, awaiting inspection" badge was wider than the card and pushed the page sideways. It depends on time of day and on arrivals inserted by an earlier test. Hour labels also overlapped on a phone. | Card overflow and truncation fixed, and a new `hourStepFor`. The test inserts its own arrival at 23:55 (reproduced locally at 23 px).   |
| **people-screens:225**                                | Code. `staff-screen.tsx` keyed `<PermissionMatrix>` by role content, so the refresh after save remounted the grid and detached an open "Actions" menu.                                                                                    | Key removed and the matrix takes the server answer in place. A new browser test and 3 unit tests go red without the fix.                |
| **maintenance-ux:80**                                 | Code. The block-reason hint said "room or bed" on a property with no beds.                                                                                                                                                                | New `blockReasonHintBed` key in en/tr/ar.                                                                                               |
| **maintenance-ux:124**                                | Test. Occupied rooms became read-only in lane 07 (CALENDAR-09).                                                                                                                                                                           | Test rewritten to assert the refusal in words.                                                                                          |
| **calendar-rooms-audit:223** (grid y 280 vs <260)     | Code. The search input claimed a full row at 1240 px, so the Filters button wrapped.                                                                                                                                                      | Toolbar classes changed. CI's 280.5 reproduced locally and is now below 260.                                                            |
| **today-ux:235** (offline)                            | Code, inferred. TanStack's `onlineManager` only learns of offline from the window event. A tab that goes offline before hydration never sees it.                                                                                          | The snapshot now also reads `navigator.onLine`. A new unit test goes red without the change.                                            |
| **row-actions-reachable:91** (Audit log, ar, 1024)    | Test, inferred. It read overflow once, then waited 15 s for a cue. The table is probably wider for a moment while the Arabic web font swaps in.                                                                                           | Overflow and cue are now polled together.                                                                                               |
| **ux-front-desk:306**                                 | Already fixed by `4d84d8a`.                                                                                                                                                                                                               | Passes locally (26 of 26 in the file).                                                                                                  |

today-layouts:118 and shell-access:76 were fixed before I started.

### How I reproduced each

- **Reproduced locally:** today-ux:324, housekeeping:51, today-audit:437, calendar-rooms-audit:223, maintenance-ux:80 and :124.
- **people-screens:225:** not reproducible as a race. The CI trace shows the 671 ms save response landing between the "Actions" click and the "Stop offering" click. I tried delaying the request and the response and the old code still passed. I wrote an equivalent test instead (change the role in the DB, call `router.refresh()` while the menu is open), which is red without the fix and green with it.
- **today-ux:235:** my hydration-race probe was invalid, because the delayed scripts failed offline and the page never hydrated at all. The evidence is the CI trace, where the last JS chunk finished about 500 ms before `setOffline` in a dev build. Please treat this cause as inferred, not proven.
- **row-actions:91:** not reproduced. The CI screenshot shows no overflow and the cue was correctly false. The font-swap cause is inferred. Forcing the cue off turns the Audit log red locally, so the guard still holds.

### Commands and counts

- Final run of today-ux, today-audit-fixes, people-screens, housekeeping, calendar-rooms-audit, maintenance-ux and today-layouts at `--repeat-each=2`: **156 passed**.
- row-actions at 768 en, 1024 en and 1024 ar, 2× each: 10 passed.
- ux-front-desk, whole file: 26 passed.
- Unit tests: today-dashboard 42, today-layouts 64, permission-matrix plus roster-table 18, all passing.
- `tsc --noEmit` in `apps/operator-workspace` is clean, and prettier is clean on touched files. I did not run the full `pnpm check`, and pgTAP was not run because nothing changed in the schema.

### Not green or not verified

- Run 40188966359 is unchecked, as above.
- Eslint on the test files reports non-null-assertion errors that were already there and are not from my code.

I removed my throwaway config, `test-results/`, both dev servers and the native DB. The evidence PNGs touched by test runs were discarded and are not committed.

UX tweaks made: none beyond the fixes above, which are layout stability, a mobile bulk bar, a search field that no longer wraps the toolbar, and a wording fix.
UX proposals: none.

AUTONOMY: COMPLETE
