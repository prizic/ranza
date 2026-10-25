# Lane 02 today UX fixes

Final report of the lane agent, verbatim (extracted from its transcript).

## 1. Branch

`ux2/today` in `/Users/pcx/Developer/ranza-ux2-today`, head `c75311c`, rebased onto `origin/main` `1afe942` with no conflicts and no commits behind it. Nothing pushed or landed.

```
c75311c docs(today): refresh the audit evidence after the rebase and the across-midnight lateness fix
270eda0 fix(today): name the rooms headline's arguments the way the message catalogue test knows them
9d740e9 style(today): format the two specs
c8a02c6 docs(today): the rows the 2026-10-24 audit changed or proposed, in English and Arabic
5eeb487 test(today): the audit's findings proved through the browser in English and Arabic, with evidence
05770c6 fix(today): the desk layouts show every arrival, every overdue Guest once, and say why
bffc5ff fix(today): one tonight, one checked-out count, empty rooms only, and an attention row that follows the focus
```

## 2. Dispositions

"Spec" below means `tests/browser/today-audit-fixes.spec.ts`. Commit hashes are in the log above.

| ID       | Disposition                                                                                        | Proof                                                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TODAY-01 | fixed (`bffc5ff`, `05770c6`)                                                                       | Spec test 1, plus unit tests on the tonight figure                                                                                                                                                                               |
| TODAY-02 | fixed                                                                                              | Spec test 1; `checked_out_is_of_the_guests_due_today_with_the_overdue_ones_counted_apart`                                                                                                                                        |
| TODAY-03 | fixed                                                                                              | Spec test 1; `a_room_with_a_guest_in_it_is_in_house_and_in_neither_list`                                                                                                                                                         |
| TODAY-04 | fixed                                                                                              | Spec test 1; `the_rooms_headline_counts_vacant_rooms_the_way_its_list_does`                                                                                                                                                      |
| TODAY-05 | fixed                                                                                              | Spec test 2; `to_clean_says_how_many_more_rooms_wait_on_a_guest_leaving`                                                                                                                                                         |
| TODAY-06 | fixed                                                                                              | Spec test 14; `finance_starts_with_the_money_and_a_repair_never_leads_it`                                                                                                                                                        |
| TODAY-07 | fixed                                                                                              | Spec test 3                                                                                                                                                                                                                      |
| TODAY-08 | fixed                                                                                              | Spec test 3                                                                                                                                                                                                                      |
| TODAY-09 | fixed (check-in anyway asks in place on every layout)                                              | Spec test 3; `a_room_that_is_not_ready_is_asked_about_in_place_with_check_in_anyway`                                                                                                                                             |
| TODAY-10 | fixed                                                                                              | Spec test 10; `the_hand_over_names_the_overdue_guest_who_has_waited_longest`                                                                                                                                                     |
| TODAY-11 | fixed                                                                                              | Spec test 9                                                                                                                                                                                                                      |
| TODAY-12 | proposed                                                                                           | Row `TL-S3-01`, comparables Mews and Opera Cloud                                                                                                                                                                                 |
| TODAY-13 | lane 05 (same finding as ARRIVALS-04)                                                              | Handoff `from 02 to 05`                                                                                                                                                                                                          |
| TODAY-14 | fixed                                                                                              | Spec test 12; `the_queue_folds_at_five_and_the_arrows_sit_beside_the_title`                                                                                                                                                      |
| TODAY-15 | fixed                                                                                              | Spec test 13                                                                                                                                                                                                                     |
| TODAY-16 | fixed                                                                                              | Spec test 11                                                                                                                                                                                                                     |
| TODAY-17 | fixed (label and merged tile; the open-Folios definition is untouched, FINANCE-01 stays lane 07's) | `open_folios_and_their_balance_are_one_tile_not_two_that_open_the_same_list`                                                                                                                                                     |
| TODAY-18 | owner decision                                                                                     | `public.users` has no display name column and `AL-S1-10` names actors by address. Open row `TL-S3-03`, handoff `from 02 to 10`                                                                                                   |
| TODAY-19 | proposed, with a copy tweak done now                                                               | Row `TL-S3-02`, comparables Apaleo and Cloudbeds. The per-device cookie stays (`TL-DEF-04`)                                                                                                                                      |
| TODAY-20 | fixed in the page, not in the server                                                               | The departures read now seeds the page's first HTML, so the Check out buttons are in it. Spec test 16 goes red without the fix. The sequential `/api/today` reads are unchanged, and I did not measure the 2.7 s against staging |
| TODAY-21 | partly fixed                                                                                       | Figures are compact on a phone and the due-out list leads (spec test 17). The page title in the bar and the bottom dock clipping the last row are shell files, so lane 01 (handoff `from 02 to 01`)                              |
| TODAY-22 | fixed                                                                                              | Spec test 4                                                                                                                                                                                                                      |
| TODAY-23 | fixed                                                                                              | Spec test 15                                                                                                                                                                                                                     |
| TODAY-24 | fixed                                                                                              | Spec test 11                                                                                                                                                                                                                     |

Not reproduced against the audit's own staging data. I reproduced every finding on a seeded local database instead, with a fixture of 7 overdue Guests, 10 unclosed days and arrivals in every readiness state.

## 3. Rows, ADR, handoffs

- **Edge-case rows** (all `proposed` except one `open`):
  - Edited: `TL-S2-01`, `02`, `03`, `04`, `06`, `09`, `11`, `26`, and `TD-S1-18`. `TD-S1-18` was `approved` and is now `proposed`.
  - Added to `today-layouts`: `TL-S1-12`, `TL-S2-29` to `TL-S2-38`, `TL-S3-01` and `TL-S3-02`. `TL-S3-03` is the `open` row for TODAY-18.
  - Added to `today-dashboard`: `TD-S8-01` to `TD-S8-05`.
- **Arabic**: 28 rows translated. `docs/decisions/ar/today-layouts.json` is new, because the feature had no Arabic file; the rest of its 60 rows stay untranslated, as before. `pnpm decisions` now reads 1475 current, up from 1447. Four out-of-date rows remain; none are in these two features.
- **Roadmap**: one paragraph updated in `docs/roadmap.md`.
- **ADR**: none, and no migration.
- **Handoffs** appended to `goals/2026-10-25-ux-audit-fixes/handoffs.md`: to 01, to 05, to 10, and an FYI to 06. The FYI is that `inRoomFilter` now counts dirty and awaiting-inspection rooms as empty rooms only, so the housekeeping board's own "dirty" definition must match.

## 4. Verification on the final tree (after the rebase)

- `pnpm --filter @ranza/db generate` ran after the rebase.
- `pnpm check` passed: prettier, lint, typecheck, 132 unit files with 1858 tests, boundaries, docs, edge-case tables, and `next build` (exit 0). The first run failed on formatting and on the message-catalogue test; I fixed both and reran.
- Integration (`today.test.ts`, `today-ux.test.ts`): 29 passed.
- Playwright via a throwaway config against my own database: `today-audit-fixes` (19 tests, English and Arabic), `today`, `today-ux` and `today-layouts` together gave 63 passed. After the evidence refresh I reran the 19 alone, and they passed again.
- **Before and after**: with the source diff reverse-applied, 14 of the 19 new browser tests failed and 42 unit tests failed; the other 5 passed because they test the seed or already-working behaviour. With it re-applied, everything passes.
- **Not run**:
  - `db:test` was not run: pgTAP is not installed locally.
  - `db:drift` was not run: no schema change.
  - The full `pnpm test:browser` was not run, as instructed.
  - No Safari or real-phone check, only a 375 px viewport.
- **Evidence**: 15 PNGs in `docs/evidence/ux-audit-2026-10-24/today/`, all under 400 KB, and I looked at them. I ran `git restore docs/evidence` after each browser run so the overwritten older PNGs are not committed.
- **Cleanup**: dev server stopped, local database removed, throwaway config and probe deleted, worktree clean.

## 5. UX tweaks and proposals

I found one thing beyond the 24 findings. An arrival expected yesterday and read between midnight and the 04:00 rollover showed "0m late"; it now shows 14h 33m, with a unit test and refreshed evidence.

One call I made for you: I renamed two ICU arguments (`vacant` to `free`, `ready` to `count`) so the shared message-catalogue test did not need a new sample value. I preferred that to editing a file other lanes also edit.

UX tweaks made: every arrival still to come is a row with its command or reason; check-in anyway on every layout; overdue Guests listed once; overdue count on the hand-over; "+N" days-not-closed pill; compact phone figures; short weekday labels on the seven nights; the hour axis clear of the Now pill; whole guest names on house tiles; "Saved on this device." in the switcher; a heading for rooms waiting on a Guest; and the lateness fix above.

UX proposals, ranked:

1. Bulk check-out of overdue Guests (`TL-S3-01`; Mews, Opera Cloud).
2. Manager and Owner open on the overview by default (`TL-S3-02`; Apaleo, Cloudbeds). It needs your decision with `TL-DEF-04`, the layout preference following the person across devices.
3. Display names in Recent activity (`TL-S3-03`). It needs your decision and a column first.

Unrelated find, not edited: the Housekeeping board's own "dirty" definition may still count occupied rooms. It is in the handoff to lane 06.

AUTONOMY: COMPLETE
