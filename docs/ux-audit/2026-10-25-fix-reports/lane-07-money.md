# Lane 07 money UX fixes

Final report of the lane agent, verbatim (extracted from its transcript).

## 1. Branch

`ux2/money` in `/Users/pcx/Developer/ranza-ux2-money`, head `5800799`. `origin/main` was fetched after the last commit and had not moved. Nothing is pushed or landed.

```
5800799 docs(money): proposed rows ..., the browser walk and its evidence
72aecc7 fix(portfolio): an Owner with one Property is told where to give access; the ledger permission says it covers revenue reports
24fbb06 fix(analytics): no occupancy above full, a month says what it was compared with, a day opens its folio
f605033 fix(finance): one answer to what guests owe, a charge asked before it posts, a folio that keeps its tab
```

## 2. Dispositions

| ID         | Disposition                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FINANCE-01 | **fixed**, f605033. One function, `owedOnFolio`, in `apps/operator-workspace/src/lib/owed.ts`. Today, Departures, the Finance list, the folio panel and the Finance summary all use it. Test `the_open_folios_tile_owes_what_the_finance_list_adds_up` failed before and passes after. Browser test `today_departures_and_finance_give_one_answer...` also passes. |
| FINANCE-02 | **fixed**, 24fbb06. A unit now counts from the earliest Stay it holds. Two integration tests failed before and pass after.                                                                                                                                                                                                                                         |
| FINANCE-03 | **fixed**, 24fbb06. The previous-month note names the days compared, and the incomplete badge says "since August 22, 2026". Month-report unit tests cover it.                                                                                                                                                                                                      |
| FINANCE-04 | **fixed**, f605033. Post is disabled until the charge is valid, the amount error shows while typing, and Post opens a confirm showing Guest, room and amount. There is no timed undo, because reversal already exists.                                                                                                                                             |
| FINANCE-05 | **fixed** for the folio keeping its tab and Back returning to it (browser test). The table's search and page state in the address is `lane 01` (data-table). Handoff written; deferred row FO-DEF-14.                                                                                                                                                              |
| FINANCE-06 | **fixed**. The folio lines table now shows Posted under the description on a phone. The Finance list already fit at 375px, which an existing test confirms. Screenshots 06 and 07.                                                                                                                                                                                 |
| FINANCE-07 | `lane 01`. The active chip must scroll into view on a phone; it is in the shell. Handoff written.                                                                                                                                                                                                                                                                  |
| FINANCE-08 | **fixed**. A role without reservations access is told who to ask about an unpriced booking.                                                                                                                                                                                                                                                                        |
| FINANCE-09 | **fixed**, 24fbb06. A day's Stay opens its Folio ("Open Folio") for a viewer who reads money. The folio id is withheld from viewers who don't. Integration test and screenshot 09.                                                                                                                                                                                 |
| FINANCE-10 | **proposed**, row FO-DEF-13 (Record payment on the Owing row). Comparable: Mews, Cloudbeds.                                                                                                                                                                                                                                                                        |
| FINANCE-11 | **fixed**. The payment dialog starts from what is owed, and a role that lacks other actions gets a note saying so.                                                                                                                                                                                                                                                 |
| FINANCE-12 | **fixed**. A folio that cannot be opened now shows a notice. The id stays in the address on purpose, so the link can be shared and checked.                                                                                                                                                                                                                        |
| FINANCE-13 | **fixed**. RevPAR with nothing closed now says "No day has closed yet, so there is nothing to divide."                                                                                                                                                                                                                                                             |
| FINANCE-14 | `not built`. Already deferred as AN-DEF-08. A shared formatter change would break about 90 assertions.                                                                                                                                                                                                                                                             |
| FINANCE-15 | **fixed**, 72aecc7. An Owner with one Property gets an "Open People" link. A role that cannot give access is still told to ask an Owner.                                                                                                                                                                                                                           |
| FINANCE-16 | **fixed**, 72aecc7. The permission label now reads "Read the ledger and revenue reports" in en, tr and ar. The Accounting page shares that label.                                                                                                                                                                                                                  |

## 3. Rows, ADR, handoffs

- **Rows added, all `proposed` unless noted:**
  - folios: FO-S11-01..07, FO-DEF-13, and FO-DEF-14 (`deferred`).
  - analytics: AN-S6-01..05.
  - portfolio: PF-S5-01, and PF-DEF-08 (`deferred`).
  - today-dashboard: TD-S9-01.
- **Arabic:** added for every row in `docs/decisions/ar/*.json`. The approved row AN-S2-08 is untouched; AN-S6-01 narrows it.
- **No ADR and no migration.**
- **Handoffs in `goals/2026-10-25-ux-audit-fixes/handoffs.md`:**
  - to lane 01: the active chip in view on a phone, and table filter and page state in the address.
  - to lane 05: `check-out-dialog.tsx` computes `balanceMinor + pendingMinor`; it should use `owedOnFolio(departure).netMinor`.
  - to lane 03: the one function exists. The balance on the Reservations row stays `proposed`/RANZ-56. Lists need `listFolios(..., { pending: true })`.
- **Path fix:** `owedOnFolio` first lived in `packages/ranza/folios`. The depcruise rule forbids non-server app code importing `packages/ranza` at runtime, so I moved it into the app. I corrected the handoff text to match.

## 4. Verification

Run on the final tree, which is identical to commit 5800799. `origin/main` had not moved, so there was no rebase and nothing to regenerate.

- **`pnpm check`: exit 0.**
  - Prettier, lint and depcruise pass (659 modules, no violations).
  - Typecheck passes.
  - Unit tests: 134 files, 1,895 tests passed. This includes the strict edge-case test-name resolver and the docs checks.
  - Build: 28/28 tasks passed.
- **`db:test` and `db:drift`:** not applicable. I touched no migration, policy or grant. pgTAP is not installed locally.
- **Integration** (`analytics`, `folios`, `today`) on port 54567: 3 files, 138 tests passed. I did not run the full integration suite.
- **My Playwright specs:**
  - `money-audit.spec.ts`: 12 of 12 passed.
  - `ux-money.spec.ts`: 18 of 18 passed (Finance, Analytics, Portfolio).
  - Screenshots 01..12 are in `docs/evidence/ux-audit-2026-10-24/money/`, each viewed and under 400 KB (largest 232 KB).
- **Neighbouring specs:** `ledger.spec.ts` and `audit-log.spec.ts` use the changed `postCharge` helper, so I ran them. 2 tests failed in the 18-test run.
  - **`audit-log.spec.ts` "a correction is traced...":** the posted charge and its reversal worked. It fails at a wall-clock assertion, UTC 07:22 against an expected 04:22, which is a time-zone mismatch in my local seed.
  - **`ledger.spec.ts` "reaches the ledger":** it fails when the worker's outbox dispatcher reports "failed 20" on every cycle. The UI part passed (4 charge/reversal legs expected, 0 received).
  - I did not run either on an unmodified `origin/main`, so I can't prove they fail there too. I judge them environmental, but that is inferred.
- **Sabotage runs** (each went red, then I restored the code):
  - Reverting the `least(...)` start in `analytics-engine` failed with "expected 2 to be less than or equal to 1".
  - Reverting it in `analytics-breakdown` failed with "expected 36 to be 43".
  - Removing `{ pending: true }` from `today-summary` failed with Today's tile showing 184000 instead of 204000.
- **Cleanup:** the dev server, native DB, scratch files, Playwright config and `test-results` are removed. The `docs/evidence/ux-audit/*` and `docs/evidence/m1/*` PNGs that the specs overwrote were restored, not committed.

## 5. UX

**UX tweaks made:**

- Enter in the charge fields now opens the confirm.
- The amount error shows live, while typing.
- "Open Folio" is worded the same in the day drawer and the Analytics page.
- The payment dialog states what is owed.
- A role that lacks an action gets a note saying why.

**UX proposals, ranked:**

1. Record payment directly on the Owing row (FO-DEF-13; Mews, Cloudbeds). This is the most frequent Front desk job.
2. Balance and in-place check-out on the Reservations row (RG-DEF-13; Opera Cloud, Mews). This depends on the RANZ-56 decision.
3. One money convention per language (AN-DEF-08).
4. Make the Portfolio card's "money owed" use the same definition (PF-DEF-08). It is bill-only today because of the PF-S1-20 database function, so it needs a migration.
5. Table filter and page state in the address (FO-DEF-14, lane 01).

**What I did not do:**

- FINANCE-07 and the table-state part of FINANCE-05 are lane 01's files.
- The Portfolio card still shows bill-only money owed.
- Deniz's Today has no finance tile (finance focus only), so the Today agreement test signs in as a finance role.

AUTONOMY: COMPLETE
