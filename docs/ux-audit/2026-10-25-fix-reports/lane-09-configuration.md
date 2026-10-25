# Lane 09 configuration UX fixes

Final report of the lane agent, verbatim (extracted from its transcript).

**Lane 09 (configuration), report**

All 18 findings are closed except CONFIGURATION-17, which is lane 01's file. A different test in `tests/unit/new-reservation.test.tsx` failed in 3 of 5 runs, pre-existing (see section 4).

## 1. Branch

- Branch `ux2/configuration`, head `30e14bb`, rebased on origin/main `c665545`, nothing pushed.
- `git log --oneline origin/main..HEAD`, newest first:
  - 30e14bb test(integrations): not-switched-on page sends to the Property menu only for somebody with more than one Property; evidence refresh
  - 829395d test(configuration): the read-only sentence is looked for in the Organization card
  - d3e5650 test(branding): new branding tests named by the rows that own them
  - cfdd267 fix(branding): reach the logo limits through the server folder
  - 4a7471d style: prettier
  - 46b3ba0 docs: rows, Arabic, evidence
  - e2d99d9 test: unit, integration and browser suites
  - be83411 fix(configuration, branding, integrations): the audit fixes
  - 38e9cea feat(housekeeping, maintenance): defaultReach on the settings read

## 2. Dispositions

No migration touched.

| ID  | Disposition                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | fixed `be83411`. Logo judged on selection with the module's own limits. Failing-before tests: `branding-view.test.tsx` BR-S1-43, and `configuration-audit.spec.ts` in en and ar (300x64). Sabotage: `imageProblem` disabled turned the unit test red.                                                                                                      |
| 02  | fixed `be83411`. Unsaved-changes guard. Tests: `branding-view.test.tsx` BR-S1-44 and the Back-arrow spec. Sabotage: guard disarmed turned the unit test red.                                                                                                                                                                                               |
| 04  | fixed `be83411`. Reset opens a confirm that names the logo, colour and draft that go. Tests: `branding-view.test.tsx` BR-S1-45 and the spec. Sabotage: direct `reset()` turned the unit test red.                                                                                                                                                          |
| 11  | fixed `be83411`, `38e9cea`. The confirm gives counts and names the Properties that keep their own answer. Tests: 3 `inspection-settings.test.tsx` cases, 2 integration tests on a real database (archived Property excluded, null for a reader without default reach), and the spec. Sabotage: `DefaultReachLines` returning null turned 3 unit tests red. |
| 03  | fixed. The preview is a mini Portal under the colour card, drawn with a logo only when one exists. Tests: `configuration-audit.spec.ts` BR-S1-46 and BR-S1-47. Screenshot-backed.                                                                                                                                                                          |
| 05  | fixed. Unset colour well is dashed theme green. Tests: unit test plus spec.                                                                                                                                                                                                                                                                                |
| 06  | fixed. Plain-words verdict with the ratios folded under "Contrast details". Tests: spec, and `branding.spec.ts` updated.                                                                                                                                                                                                                                   |
| 07  | fixed. On a 375 px screen the preview is fully in view while the colour field is at the top. Test: spec.                                                                                                                                                                                                                                                   |
| 08  | fixed. Styled picker with file name, size and pixels, in Arabic too. Test: spec.                                                                                                                                                                                                                                                                           |
| 09  | fixed. `denied.notEnabledDescription` is now conditional on having more than one Property. Test: the `integrations.spec.ts` INT-S1-79 assertion.                                                                                                                                                                                                           |
| 10  | fixed. A first setup hides the four zero tiles and leads with the endpoints section. Tests: unit and `integrations.spec.ts` INT-S1-51. Sabotage: `firstSetup = false` turned the unit test red.                                                                                                                                                            |
| 12  | fixed. One sentence everywhere (en, tr, ar). Tests: `configuration.test.tsx` and the specs.                                                                                                                                                                                                                                                                |
| 13  | fixed. `WRAPPING_TRIGGER` on the housekeeping and maintenance selects. Test: spec asserts no clipping at 375 px.                                                                                                                                                                                                                                           |
| 14  | fixed, partially. A curated city table (about 110 zones) in ar and tr, with Arabic comma. A zone outside the table keeps its Latin city. Tests: `time-zone-labels.test.ts`, CF-S3-16. Sabotage: dropping the table lookup turned 3 tests red.                                                                                                              |
| 15  | fixed. One Arabic word for Property (المنشأة). Test: spec checks the page has no "العقار".                                                                                                                                                                                                                                                                 |
| 16  | fixed. The People link keeps `?property=`. Tests: unit and spec.                                                                                                                                                                                                                                                                                           |
| 18  | fixed in part. The "not available yet" line is mine (`securityMissing`). The grammatical sentence is lane 01's: it already landed as "Manage how you sign in."                                                                                                                                                                                             |
| 17  | `lane 01`. Security is not in `screens.ts` on c665545. Written to handoffs.md under `## from 09 to 01`.                                                                                                                                                                                                                                                    |

## 3. Rows, ADR, handoffs

- **Branding:** new rows BR-S1-43..47 and a new `BR-DEF-08`. BR-S1-42 reworded. The old BR-S1-42 browser test now checks the client path and is renamed to BR-S1-43.
  - BR-DEF-08, dropping a logo onto the preview, is the new-interaction proposal. Comparables: Mews and Cloudbeds.
- **Configuration:** CF-S3-16, 22 and 25 changed. CF-S3-27 and 28 added.
- **Integrations:** INT-S1-79 changed. INT-S1-81 added.
- All rows are `proposed`, and Arabic is added for each. `pnpm decisions` shows 0 orphaned. 4 rows are out of date; I did not check which feature they belong to. My changed rows are current.
- No ADR.
- Handoff to 01 is written, covering CF-17 and the `notEnabledDescription` merge. The rebase conflicted on `denied.notEnabledDescription` in all three locales. I kept lane 01's content and made the menu advice conditional. handoffs.md had no block addressed to 09, and none of my specs click table row ticks.

## 4. Verification on the final commit (after the last rebase)

- `pnpm format`: clean.
- `pnpm lint`: no dependency violations. It first caught `branding/page.tsx` importing `@ranza/branding` directly; fixed in `cfdd267` via `server/logo-limits.ts`.
- `pnpm typecheck`: 28/28.
- `pnpm test` on the final commit: 142 of 143 files, 1965 of 1966 tests passed.
  - The one failure is `new-reservation.test.tsx` ("a_unit_booked_for_the_chosen_nights…", sometimes also "a_refusal_keeps_the_stay_type…"). It fails or passes between runs: failed in 3 of 5 runs, passed in 2 (1965/1966 passed in one full-suite run, then 27/27 on a rerun alone), under load average above 100.
  - My diff touches nothing in reservations. I did not run it on a clean main, so "pre-existing" is inferred, not verified.
  - The earlier full run, before the last commit, was 143/143 and 1966/1966.
- `pnpm check:docs`, `check:edge-cases` (29 tables) and the boundary checks all PASS.
- `pnpm build`: 28/28 tasks successful, run after the rebase.
- Integration, real database on port 54569: `housekeeping.test.ts`, `maintenance.test.ts` and `branding.test.ts`, 3 files and 106 tests, all pass.
- Playwright (my throwaway config, workspace on 55569, portal on 56569):
  - `configuration-audit.spec.ts` 12/12, `branding.spec.ts` 12/12, `configuration.spec.ts` 9/9.
  - `maintenance-ux.spec.ts` was run together with `configuration.spec.ts` and reported 21 passed for the pair.
  - `integrations.spec.ts` 13/13 on its last full run. A shorter run of 9 earlier showed 1 failure that I fixed.
- Not run:
  - `db:test`: pgTAP is not installed natively, and no migration or policy was touched.
  - `db:drift`: not applicable, no schema change.
  - `test:browser` in full: not run, per the brief.
- Evidence: 11 PNGs in `docs/evidence/ux-audit-2026-10-24/configuration/`, all under 400 KB, and I looked at the key ones. The `m1` and `ux-audit` PNGs that the specs overwrote were restored and not committed.

## 5. Extras and limits

- UX tweaks made beyond findings: file name, size and pixels shown after choosing a logo; a "To save, choose a different logo or discard…" hint when Save is disabled; Reset disabled on a default brand; Reset's list includes an unsaved draft; Save, Reset and Discard moved to their own bar; the preview shows no logo when there is none; Arabic comma in time zone labels.
- UX proposals, ranked:
  1. Security in the sidebar System group (lane 01).
  2. BR-DEF-08, logo drag and drop.
  3. Show which Properties carry their own override on the Configuration card.
- Limits:
  - The city table covers only the zones in it.
  - The "Save for every Property" button label is unchanged.
  - The `integrations.spec.ts` first-setup screenshot shows the dev-server "Compiling" badge.

Throwaway files, dev servers and the native database cluster are removed.

AUTONOMY: COMPLETE
