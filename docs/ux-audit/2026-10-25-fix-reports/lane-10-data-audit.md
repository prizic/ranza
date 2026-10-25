# Lane 10 data-audit UX fixes

Final report of the lane agent, verbatim (extracted from its transcript).

Lane 10 (data-audit): 12 of the 15 findings are fixed, one is an owner decision, and two are proposed. Nothing is pushed and `git land` was not run.

## 1. Branch

- Branch `ux2/data-audit`, head `87dd300`, rebased onto origin/main `74f8a19`.
- `git log --oneline origin/main..HEAD`:
  - `87dd300` test(browser): the audit log's phone card and When heading, the wide-table cue on a board that still has one
  - `e327c2c` test(data-audit): the audit log and the data export through the real UI, every export and schedule state seeded, with evidence
  - `119e7ba` feat(data-export): a file the reader cannot take is not offered, schedules say how they last ran, the form names the clock and why it is off
  - `8c099fa` feat(audit-log): money, reasons, details and the clock read as words; the whole row opens its record, as a card on a phone
- No migration was added.

## 2. Dispositions

| ID                                 | Disposition                                     | Commit and proof                                                                                                                                                                                                                                                |
| ---------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DATA-01 raw keys, bare balance     | fixed                                           | `8c099fa`; `audit-reading.test.tsx` DATA-01 (3 tests); `audit-writers.test.ts` now strips comment lines and went red on `nightsCharged` before the fix. The check-out `balanceMinor` is now written as a number.                                                |
| DATA-02 payment minus sign         | fixed                                           | `8c099fa`; `audit-reading.test.tsx` DATA-02 in en/tr/ar; a reversal keeps its sign.                                                                                                                                                                             |
| DATA-03 whole row clickable        | fixed                                           | `8c099fa`; stretched-link unit test; `data-audit-ux.spec.ts` presses the Why cell.                                                                                                                                                                              |
| DATA-04 "No reason required" noise | fixed                                           | `8c099fa`; ordinary empty reason is a dash with sr-only words. A required reason that is missing says "No reason recorded".                                                                                                                                     |
| DATA-05 `guest_request:` prefix    | fixed                                           | `8c099fa`; becomes "The Guest asked: …", only when the record's own `reasonKind` says so.                                                                                                                                                                       |
| DATA-06 375 px list                | fixed                                           | `8c099fa`; one card per record, no sideways scroll. Spec and `audit-list-375.png`.                                                                                                                                                                              |
| DATA-07 actors by email            | owner decision                                  | No column added, no rendering change. Names live only in `auth_user`, which `ranza_app` cannot read, AL-S1-10 is approved as "address", TL-S3-03 is open. Closed in `handoffs.md` under `from 10 to 02`.                                                        |
| DATA-08 IANA id in header          | fixed                                           | `8c099fa`; header reads "When (Property time)", record names the Property under the time; AL-S2-09 tests.                                                                                                                                                       |
| DATA-09 no Newer paging            | proposed                                        | Row AL-S2-21 (Mews and Opera Cloud audit trails page both ways).                                                                                                                                                                                                |
| DATA-10 Download not offered       | fixed                                           | `119e7ba`; the list carries the download right, so a refused file shows its reason instead of a button. Integration test EXP-S1-64 covers allowed, `not_requester` and `role_lacks_datasets`; it went red under sabotage. Unit tests and spec cover the screen. |
| DATA-11 schedule last run          | fixed                                           | `119e7ba`; last run time, outcome and a "Show in History" link. Integration EXP-S1-65, unit tests for never run, ready, failed, processing, expired and paused-without-duplicate.                                                                               |
| DATA-12 disabled-button reason     | fixed                                           | `119e7ba`; the reason sits beside the button on both forms, tested at 375 px in the spec.                                                                                                                                                                       |
| DATA-13 clock/UTC                  | fixed in the screen, proposed for the file name | Form names the Property's clock and today's UTC offset for any range that cuts data. The file name is made by a DB function from the UTC date, so naming the zone there needs a migration: row EXP-S1-70, proposed.                                             |
| DATA-14 Arabic-Indic digits        | fixed                                           | `119e7ba`; a unit test scans every Arabic data-export and audit string.                                                                                                                                                                                         |
| DATA-15 History 50-cap, no filter  | proposed                                        | Row EXP-S1-69 (Mews, Cloudbeds).                                                                                                                                                                                                                                |

I did not pin the browser clock for DATA-13. The note's offset is computed on both server and client at render time, so pinning only the browser would trigger a hydration mismatch. Istanbul has no daylight saving, so the spec is clock-stable, and the offset helper is unit-tested at pinned instants (winter and summer London, Kolkata, New York, UTC).

## 3. Rows, ADR, handoffs

- **Rows (all `proposed`):**
  - AL-S2-15 to AL-S2-21 added; AL-S2-09 reworded (it was proposed, so editable).
  - EXP-S1-64 to EXP-S1-70 added.
  - Arabic is in `docs/decisions/ar/audit-log.json` and `data-export.json`, and `pnpm decisions` reports them current.
  - The remaining "4 out of date" and 522 missing rows are not mine.
- No ADR was needed, and the roadmap status table is unchanged.
- **Handoffs:** answered `from 02 to 10` (TODAY-18). I wrote no need for lane 01, since the phone card is inside my own audit-table file.
- **FYI for lane 07:** the Arabic `amountFormat` string in the money section of `messages.ts` still has Arabic-Indic digits; I left it alone.
- **Edits to other specs:**
  - `audit-log.spec.ts`: header, year-less time, and the "Who" card label.
  - `shell-width.spec.ts`: the wide-table cue test now reads the Housekeeping board, because the audit log no longer scrolls sideways at 375 px.
  - `rates.test.ts` and `folios.test.ts`: `balanceMinor` is now a number.
  - `messages-icu.test.ts`: new sample parameters for the new strings.

## 4. Verification on the final head (all foreground)

- **`pnpm check`** (format, lint, boundaries, typecheck, tests, build): exit 0; 145 test files, 2005 tests passed, 28/28 tasks.
- **Integration** (`data-export`, `audit-log`, `rates`, `folios`): 4 files, 119 tests passed.
- **Playwright** (`data-audit-ux`, `audit-log`, `data-export`, `shell-width`, plus the 4 seed setups): 46 passed on a throwaway config at port 55570. `data-audit-ux.spec.ts` is 6 tests, and every state is seeded in the spec, so it does not rely on another spec's data.
- **Sabotage:**
  - Unit: 7 audit tests and 8 data-export tests went red and were restored.
  - Integration: EXP-S1-64 went red.
  - Browser: 4 of the 6 spec tests went red, then restored.
- **`db:test` and `db:drift`:** not run, because there is no schema change.
- **Evidence:** 8 PNGs, 66 to 179 KB, in `docs/evidence/ux-audit-2026-10-24/data-audit/`, each viewed. Evidence PNGs that the full specs overwrote were restored to HEAD.

## 5. Environment note

My native Postgres defaulted to the Istanbul time zone, which made the existing `narrows_by_day_in_the_propertys_clock` integration test fail and shifted displayed times by 3 hours. It failed identically on a pristine origin/main worktree. `alter database ranza set timezone to 'UTC'` fixed it, matching CI. Other lanes' native clusters may see the same failure.

**UX tweaks made:**

- The reason beside the disabled button is also on the New schedule form.
- The phone card includes Where.
- Times in the current year drop the year at every width.
- Missing required reasons are labelled in words.
- Context-key writers are now checked by a scan that ignores comments.

**UX proposals:**

1. Newer records paging (AL-S2-21).
2. History filters (failed only, mine) and an Older button (EXP-S1-69).
3. Zone or offset in the export file name (EXP-S1-70, needs a migration).

Cleanup done: dev server stopped, native database removed, scratch files deleted, working tree clean.

AUTONOMY: COMPLETE
