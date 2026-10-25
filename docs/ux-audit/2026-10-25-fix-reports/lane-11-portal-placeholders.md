# Lane 11 portal-placeholders UX fixes

Final report of the lane agent, verbatim (extracted from its transcript).

# Lane 11 (portal-placeholders) report

**1. Branch.** `ux2/portal-placeholders`, head `803eb47`, rebased on origin/main `87dd300`, not pushed, no `git land`. The worktree is clean.

```
803eb47 test(portal-placeholders): the audit's Portal, sign-in and Planned screen findings walked through the browser, with their rows and evidence
dc1f69f feat(workspace): a Planned screen says it is not available yet and leads back to Today, the rail marks it Soon, and sign-in says who can help
1fb8e1f fix(guest-portal): one frame for sign-in, help and unknown addresses, a help line instead of a link that repeats it, the language menu keeps the page, the corner names the Guest
```

**2. Dispositions (all 9 finding IDs).**

| ID        | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PORTAL-01 | **owner decision.** Decision needed: keep or hide the unbuilt Food and Beverage and Inventory rail entries, which ADR 0056 offers on purpose. I hid nothing. As a tweak, the sidebar (`dc1f69f`) and the chips layout mark those two "Soon" (tr "Yakında", ar "قريبًا"). The phone bottom dock is not marked: a tile has no room for a third line. Handed to lane 01.                                                                            |
| PORTAL-02 | **fixed** (`dc1f69f`). `PlannedScreen` now reads "Coming later", then "Not available yet.", then what comes first, then a "Go to Today" button that keeps `?property=`. Wording is in en/tr/ar. F&B says it comes after Inventory is in use and a Guest's Folio can take charges. Inventory says it is built in a later release and needs no setup on your side. Test: `screen-icons.test.tsx` "PORTAL-02" plus the Planned-screen browser test. |
| PORTAL-03 | **already fixed** by lane 01 (SHELL-08, OA-S5-19): no handover link, no "Blueprint 5.x". I reproduced it as gone on the real Planned screen, with no `github` link in `main`.                                                                                                                                                                                                                                                                    |
| PORTAL-04 | **fixed** (`dc1f69f`), with a better line than suggested. A line under Sign in says "Forgot your password, or can't sign in? Contact Prizic support." The audit's "Ask your Property's administrator" would be false: no password-recovery flow exists (OA-NB-02), and the refusal copy already says Prizic support (OA-S5-06).                                                                                                                  |
| PORTAL-05 | **fixed** (`1fb8e1f`). Language menu items are `max-md:min-h-11` (they were 32 px under a mouse at 375 px; touch devices already got 44). The 404 button is 44 px or more. The "Forgot your password?" link is removed (see PORTAL-08).                                                                                                                                                                                                          |
| PORTAL-06 | **fixed** (`1fb8e1f`). The 404 is drawn in the same auth frame (wordmark, language menu). The tab reads "This page doesn't exist · Ranza"; a `<title>` element in the page does this, because Next ignores not-found metadata (the tab stayed "Ranza"). The button is "Sign in" when signed out and "Go to my stay" when signed in.                                                                                                              |
| PORTAL-07 | **fixed** (`1fb8e1f`). `Help` is told its route, and the reset page carries its encoded query. `/reset-password?token=…` switches to `/tr/reset-password?token=…` with the token intact.                                                                                                                                                                                                                                                         |
| PORTAL-08 | **fixed** (`1fb8e1f`), taking the audit's first option. The link is dropped and the one line now reads "No account, or forgot your password? Ask the front desk at your property." The `/forgot-password` and `/reset-password` routes stay for bookmarks.                                                                                                                                                                                       |
| PORTAL-09 | **fixed** (`1fb8e1f`). I seeded a Resident login and reproduced it. The Portal viewer now carries `name`, which is the account's name, else the part of the email before the @. The email sits beneath it and is never printed twice. The Stay has no name, and ADR 0009 keeps Guest rows away from a Resident, so the account name is the best source.                                                                                          |

**3. Rows, ADRs, handoffs.**

- Rows added or changed, all `proposed`, with Arabic in `docs/decisions/ar/*.json` (the rows I touched are current in `pnpm decisions`):
  - changed: GP-S1-01, GP-S1-04, OA-S5-19;
  - added: GP-S1-08 (language menu keeps the page and query), GP-S1-09 (touch targets), GP-S1-10 (the Guest's corner), OA-S5-25 (Workspace sign-in help).
- No ADR, no migration.
- Handoff to lane 01 appended to `handoffs.md`. It lists my small edits to lane-01 files: `app-rail.tsx` (a leaf with a badge wraps its name instead of truncating, since "Food & B…" was cut off), `nav-chips.tsx`, `lib/nav.ts`, `language-switcher.tsx`. It also notes that lane 01's shell-access Planned-screen test never draws the Planned screen (its Property has neither capability on), so my spec opens the real one.

**4. Verification** (all on the rebased commits, native DB on 54571, set to UTC).

- `pnpm check`: exit 0, 145 test files and 2006 tests passed, build succeeded.
- My spec `portal-placeholders-ux.spec.ts` has 9 tests (13 with the seed project) and passes in full. The same Playwright run also passed `guest-portal-ux`, `shell-access`, `navigation`, `session` and `error-screens`, for 56 passed.
- `screen-access`: that first run failed two tests ("every page the rail offers opens" for Owner and Manager) at the `toHaveURL` after sign-in, under heavy load (8.5 min). They passed on a solo rerun, along with the other roles (9 of 9).
- Sabotage: with all `apps/` and `packages/` changes reverted, 8 of the 9 new tests failed. The ninth, signed-in 404 goes to the stay, passes before and after; it is a regression guard.
- Evidence: 9 PNGs in `docs/evidence/ux-audit-2026-10-24/portal-placeholders/`, each 312 KB or smaller, and I looked at them. Tracked PNGs that other specs overwrote were restored.
- `db:test` and `db:drift`: not run, because I touched no schema or policy. Docker and pgTAP are unavailable here, as the brief states.
- Teardown: dev servers stopped, native database removed.

**5. UX tweaks made beyond the findings.**

- "Soon" marks on the sidebar and chips (PORTAL-01).
- The sidebar label wraps instead of truncating when it carries a badge.
- "Go to Today" keeps the active Property.
- The 404's language menu leads to pages that exist (sign-in or stay).

**UX proposals, ranked:**

1. Show the unbuilt destinations once on Configuration under "Coming modules" and hide them from daily navigation. This is the owner's call on ADR 0056; Mews and Apaleo gate unlicensed modules out of the main nav.
2. A phone bottom-dock mark for unbuilt tiles needs a layout decision from lane 01.

**Not done:**

- The audit's Resident Stay page checks were limited to the account name (PORTAL-09).
- A reset-by-email flow is not built (GP-DEF-03).
- The password-recovery gap (OA-NB-02) is unchanged.

AUTONOMY: COMPLETE
