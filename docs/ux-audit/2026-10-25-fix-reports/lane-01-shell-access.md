# Lane 01 shell-access UX fixes

Final report of the lane agent, verbatim (extracted from its transcript).

Lane 01 (shell-access) is done: 13 of 15 findings fixed, one split, one owner decision. `pnpm check` passes on the final commit after the last rebase, and the Playwright specs I ran pass.

**1. Branch and commits**

Branch `ux2/shell-access`, head `03aca27`, rebased on `origin/main` after the 13-commit fetch. Not pushed or landed.

```
03aca27 a table's search and ticks have names, bulk bar holds its place, chips take the row on a tablet, Today keeps its name on a phone, bottom-bar spec waits
73c148b the dock and the chips move their own row, not the page
01ea70c navigation spec: session ended signs in through the dialog or the next page
c5e4cbb scroll hook iterates children; shell test shares the provider's query copy
5d6f304 docs: proposed rows OA-S5-12..24 (+Arabic), ADR 0056 Manager correction, evidence
1512568 role refusal points to whoever manages staff
b3ffac5 feat(shell): refusals, unknown addresses, ended sessions, sign-in waits, long lists
```

**2. Dispositions**

Each fix has a unit test or a Playwright spec in the final commit; sabotage runs are in section 4.

| ID       | Disposition                                                                                                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SHELL-01 | fixed. Rows are tighter at 960 px height or less, and a fade plus chevron shows when more is below. A short Owner screen still scrolls but now says so. `shell-navigation.test.tsx`, `shell-access.spec.ts` at 878 px.                                            |
| SHELL-02 | split. The cue and the active item scrolled into view are fixed. The "More" sheet is `proposed` (OA-S5-20).                                                                                                                                                       |
| SHELL-03 | fixed. An unknown path opens inside the shell with a back button and Go to Today. A locale-less path redirects, and `/front-office` opens its first page. The HTTP status stays 200 because pages stream.                                                         |
| SHELL-04 | fixed. Go to Today button, names the page, and says "Ask whoever manages staff in your Organization". I adopted lane 08's wording for the tail.                                                                                                                   |
| SHELL-05 | fixed. All refusals, including Finance and the audit log, share one shape.                                                                                                                                                                                        |
| SHELL-06 | fixed. Groups start open and a closed group is remembered per device.                                                                                                                                                                                             |
| SHELL-07 | fixed. A 401 on any read opens a non-dismissable "signed out" dialog that signs in and returns to the address.                                                                                                                                                    |
| SHELL-08 | fixed. Planned screens say "Coming later" with no link to a handover note or the blueprint.                                                                                                                                                                       |
| SHELL-09 | fixed. HR gets Briefcase and Inventory gets Warehouse. A unit test asserts every icon is unique.                                                                                                                                                                  |
| SHELL-10 | fixed. The wait counts down and the button stays disabled. Screen readers hear the refusal once.                                                                                                                                                                  |
| SHELL-11 | owner decision. No support contact or staff password-reset flow exists in the repo (OA-NB-02). Telling someone to "ask your Owner" would be false.                                                                                                                |
| SHELL-12 | fixed. One account control per layout, and the Security subtitle reads as a sentence.                                                                                                                                                                             |
| SHELL-13 | fixed. Numeric keypad by default, with a switch to a backup code and back.                                                                                                                                                                                        |
| SHELL-14 | owner decision. Verified against migration `20260916011100`: only the Owner holds `branding.manage`. I corrected the sentence in ADR 0056, which is Proposed, and it now carries a dated Correction note. Whether a Manager should reach Branding is Seif's call. |
| SHELL-15 | fixed. The current chip is scrolled into view.                                                                                                                                                                                                                    |

Findings queued for me in `handoffs.md` by lanes 02, 03, 06 and 08:

- Done: search box is named; the bulk bar holds its place (list moved 66 px before, 0 now); each tick is named per row; `useTableLabels` is memoized; chips take a full row below 1280 px; Today keeps its name in the bar on a phone; search fills the row on a phone.
- Not reproducible: the dock covering the last row is a mid-scroll screenshot. The end of the page clears it, and `shell-width.spec` now proves that.
- Proposed (OA-S5-22, 06-3, 06-4): reservations table as phone cards, filters in the address, and an open count in the rail.
- Hiding unbuilt rail entries is an owner decision (ADR 0056 offers them on purpose).

**3. Rows and handoffs**

- `docs/features/organization-and-access/edge-cases.csv`: OA-S5-12 to OA-S5-24, all `proposed`, with real test names. OA-S5-20 (dock More sheet) and OA-S5-22 (cards on a phone) are new interactions with no test. The two comparable systems named there (Mews, Cloudbeds) are from memory and say so.
- Arabic added for all 13 in `docs/decisions/ar/organization-and-access.json`. The register's current count went from 1447 to 1474. The rest of the Arabic backlog was already there.
- No new ADR. ADR 0056 got the correction note only.
- `handoffs.md`: answers to 03, 08, 02 and 06. Lane 03's messages.ts hunk for `denied.noPermissionDescription` will conflict with mine; the resolution is in that note.

**4. Verification on `03aca27` (after the last rebase)**

- `pnpm check`: exit 0. Format, lint, typecheck, `edge-cases-check` and docs checks pass. 136 unit files, 1895 tests passed. Build 28 of 28.
- Playwright through my own config on port 55561: `shell-access` (21 tests), `screen-access`, `security`, `session`, `navigation`, `shell-width`, `one-heading`, `error-screens`, `housekeeping-ux`. 65 of 65 passed, including 4 seed tests.
- Sabotage runs, each went red and was restored byte-identical:
  - 401 dialog, scroll cue, group default-open, current chip, icon uniqueness, Go to Today link.
  - Sign-in disabled state, countdown, locale-less redirect.
  - Table search label, bulk-bar slot (66 px move), tick naming, `useTableLabels` memo.
  - Chips breakpoint, Today title (310 px strip), `scrollIntoView` versus own-row scrolling.
- Not run: `db:test` (pgTAP isn't installed natively, and I touched no migration, policy or grant), `db:drift`, and `test:integration` (no database code changed).
- A first full `pnpm check` after the rebase failed on `new-reservation.test.tsx` (lane 03). It passed alone three times, and the next full runs passed. The machine load average was about 75.
- `shell-width.spec` "the end of a phone page clears the bottom bar" failed about one run in four, with or without my dock change. It raced Today's data loading. I made it re-scroll until the page settles, and it passed 8 of 8.
- `navigation.spec` "a session ended" was blocked by the new dialog whenever a poll noticed first. It now accepts the dialog or the next-page redirect, and passed 3 of 3.
- Existing tests I updated because behaviour changed: `screen-access`, `security` (`exact: true` for the Today link), `finance-page`, `housekeeping-board`, `housekeeping-ux`, `messages-icu`, `table-search`.

**5. UX tweaks and proposals**

UX tweaks made beyond the findings:

- The page bar shows "Page not found" with a back button on unknown routes.
- The Front Office group has a title for breadcrumbs.
- Sign-in screen-reader and visible countdown are split.
- Dock and chips fade at the edge that has more.
- Dock and chips scroll only their own row, not the page.
- A table with ticks shows "Tick rows to act on several at once." where the bulk bar will appear.

UX proposals, ranked:

1. Dock "More" sheet (OA-S5-20). Fifteen destinations in a 351 px strip is the weakest part left.
2. Reservations and similar tables as cards below 768 px (OA-S5-22).
3. A support contact or staff password-reset on sign-in (SHELL-11, needs an owner decision).
4. Filters kept in the address (HK-S1-38).

Not done:

- Hiding unbuilt rail entries.
- Hosted staging and port 54322 were never touched.

The worktree is clean. My dev server, native DB, throwaway Playwright config and `test-results` are removed, and the evidence PNGs (all under 400 KB, looked at) are in `docs/evidence/ux-audit-2026-10-24/shell-access/`.

AUTONOMY: COMPLETE
