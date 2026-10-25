# Lane 06 housekeeping-services UX fixes

Final report of the lane agent, verbatim (extracted from its transcript).

**Lane 06 (housekeeping-services): all 17 findings have a disposition below.**

1. **Branch:** `ux2/housekeeping-services`, head `b6bb8f1`, rebased onto origin/main `a6b7089`. Nothing pushed or landed.

```
b6bb8f1 docs(housekeeping, maintenance, guest-experience): rows and Arabic for the audit's phone and read-only findings
a30382b test(housekeeping-services): the audit's phone, read-only drawer and impact findings through the real UI
af1f160 fix(guest-experience): one word per concept, sentence case, and tabs that fit a phone
d6d8bf5 fix(maintenance): a viewer reads assignee and priority as text, and the occupants are named before the first press
8ba4f2c fix(ui): the Editorial masthead is short on a phone and a side drawer fills it
6c7ce1d fix(housekeeping): the board says who is in each room on a phone, counts once, and reports from the row menu
```

`d6d8bf5` uses `maintenance.sheetReadOnly`, which `af1f160` adds, so `d6d8bf5` alone does not typecheck. The branch as a whole does.

2. **Dispositions**

| ID                               | Disposition                                                                                                                                                                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 chips strip at 768            | `lane 01`, handoff item 1                                                                                                                                                                                                                                                                     |
| 02 one-tap mark                  | `proposed`, row HK-S1-36 (Mews, Opera Cloud)                                                                                                                                                                                                                                                  |
| 03 bulk bar                      | Partly `fixed` in `6c7ce1d`: the bar is icon-only and 106 px tall, down from about 210. Test: "keeps the bulk bar to icons…". The list still shifts when the bar appears, which is the data table's: `lane 01`, handoff item 2. Row HK-S1-34.                                                 |
| 04 table 940 px on a phone       | Occupancy under the room is `fixed` in `6c7ce1d`. Test: "says on a phone whether anybody is in the room…". The card layout is `proposed`, row HK-S1-39.                                                                                                                                       |
| 05 stat tiles                    | `fixed` in `6c7ce1d`. The Dirty, Clean and Inspected tiles are hidden on a phone because the chips already show them. Spec: `housekeeping-services-ux.spec.ts`.                                                                                                                               |
| 06 Report a problem link         | `fixed` in `6c7ce1d`. It is now a row-menu item; the inline link stays on desktop and for viewers without a menu. Test: "reaches Report a problem from the row menu…".                                                                                                                        |
| 07 filters not in the address    | `lane 01` (data table state, page-bar origin), handoff item 3. `proposed` row HK-S1-38.                                                                                                                                                                                                       |
| 08 board load time               | `already fixed` by PR #97 (`e156cb2`, migration 012200). With 42 rooms on my local build the page took 0.49 to 0.75 s over four fetches, against 2.0 to 2.5 s on staging in the audit. This is a dev server on a loaded machine, not staging, so it supports the claim but does not prove it. |
| 09 tall masthead                 | `fixed` in `8ba4f2c`. The drawing is dropped below `sm` and the heading wraps whole. The side drawer was 75% wide on phones because `data-[side=end]:w-3/4` outranked `w-full`; it is now full width. Row MT-S1-41. Spec screenshots checked.                                                 |
| 10 open counts                   | `not built` (deferred rows GX-DEF-02, MT-DEF-15), plus `lane 01`, handoff item 4.                                                                                                                                                                                                             |
| 11 assignee cannot act           | `proposed`, rows MT-S1-42 and GX-S1-30. Approved rows MT-S1-12 and GX-S1-12 say non-managers cannot move a request, so this needs a policy change and the owner.                                                                                                                              |
| 12 tabs cut off                  | `fixed` in `af1f160`. Tabs share the width; Open, Resolved, All. Spec at 375 px in English and Arabic. Row GX-S1-28 edited.                                                                                                                                                                   |
| 13 one word per concept          | `fixed` in `af1f160`. Start, In progress and New request are consistent, in sentence case, in English and Turkish. Resolved is kept because it is the stored status. Test: `guest-experience-copy.test.ts`. Row GX-S1-29.                                                                     |
| 14 read-only drawer              | `fixed` in `d6d8bf5`. Assignee and priority show as text, with one notice at the top. Test: `maintenance-request-sheet.test.tsx`. Row MT-S1-40.                                                                                                                                               |
| 15 impact before first press     | `fixed` in `d6d8bf5`. The drawer now reads the existing `outOfOrderImpact`, which nothing used before, through a new `loadOutOfOrderImpact` server action. The guest and departure day show before the first press, and that press goes ahead. Row MT-S2-37.                                  |
| 16 open-request marker on a room | `proposed`, row HK-S1-37 (Mews, Cloudbeds).                                                                                                                                                                                                                                                   |
| 17 keyboard and screen reader    | `lane 01` (data table), handoff item 5: the select checkbox is named "Select row" for every row, and `useTableLabels()` returns a new object each render. I memoized the Housekeeping columns, which fixes the remount in my lane.                                                            |

3. **Rows added or changed.** All are `proposed`, with Arabic entries.
   - **Housekeeping:** HK-S1-33 to 39 (four describe built work, three are proposals).
   - **Maintenance:** MT-S1-40 to 42 and MT-S2-37.
   - **Guest-experience:**
     - Added GX-S1-29 and GX-S1-30.
     - Edited GX-S1-19, GX-S1-25 and GX-S1-28: wording only, no approved row text touched.
   - **ADR:** none.
   - **Handoff:** `goals/2026-10-25-ux-audit-fixes/handoffs.md` has a block "from 06 to 01". It also flags that I changed `packages/ui/src/components/dialog-frame.tsx`, which every Editorial dialog and drawer inherits. Nothing was addressed to 06.

4. **Verification on the final commit, after the rebase**
   - `pnpm check` exited 0. Its output did not capture the test counts, so I reran the pieces:
     - `pnpm test:unit`: 134 files, 1842 tests passed.
     - `pnpm test:boundaries`: passed.
     - `pnpm check:docs`: passed (121 files).
     - `pnpm check:edge-cases`: passed (29 tables).
     - The build step inside `pnpm check` succeeded, 28/28 tasks, 25 of them cached.
   - **Arabic register:** `decisions-register.mjs --pending ar` lists nothing for housekeeping or maintenance, and nothing for guest-experience. Its summary shows 4 out-of-date rows elsewhere in the register, all outside my features.
   - **Playwright** on a native PostgreSQL 16 (port 54566), run through a throwaway config: `housekeeping-services-ux` (5 tests, English and Arabic), `housekeeping-ux`, `guest-experience-ux` and `maintenance-ux`. 26 passed, including the seed project.
   - **Sabotage:** the 6 new tests in `housekeeping-board.test.tsx`, the 5 in `maintenance-request-sheet.test.tsx` and the 4 in `guest-experience-copy.test.ts` were run against the old code and failed there. I did not sabotage the browser specs.
   - **`db:test` was not run** (pgTAP is not installed natively), and no migration, policy or grant changed, so there was nothing for it to cover.
   - **Cleanup:** the database, dev server, throwaway config and seed script are removed. Evidence PNGs overwritten by other audits' specs were restored and not committed.

5. **UX tweaks made:**
   - Occupancy under the room number on a phone.
   - Report a problem reachable from the row menu.
   - Icon-only bulk bar with 44 px, named buttons.
   - Counts shown once on a phone.
   - Tabs that fit a phone.
   - Every Editorial drawer fills the screen on a phone, with a shorter masthead.
   - One fewer press on Take room out of order, because the guest is already named.
   - Sentence-case, one-word copy in English and Turkish.
   - Housekeeping columns no longer remount on re-render; a unit test now guards against it.

   **UX proposals, ranked:**
   1. One-tap mark with Undo (HK-S1-36).
   2. An assignee works their own request, with a policy change (MT-S1-42, GX-S1-30).
   3. Open-request marker on a room (HK-S1-37).
   4. Filters in the address, and Back to the board (HK-S1-38).
   5. Card layout on phones (HK-S1-39).
   6. Open counts in the rail (GX-DEF-02, MT-DEF-15).

   **Not done:** lane-01 items (chips at 768, list shift on bulk bar, filter state in the address, per-row checkbox names), and anything needing the owner's approval.

AUTONOMY: COMPLETE
