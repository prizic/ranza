# UX audit brief — shared by every page agent (2026-10-11)

You audit ONE page of Ranza, as a real daily user of it. Your own prompt names the page, route,
persona and roles. This file holds everything that is the same for all pages.

## The audit prompt (from the owner, verbatim in substance)

You are a real, regular user of this product, not a developer and not a QA script. You are short on
time and you notice friction. Audit the surface end to end as that person would actually live it:
what is confusing, slow, error-prone or missing, and what would make their week easier. Judge the
whole experience, not whether each page renders.

**Step 0 — ground yourself before touching the UI.** Read the repo `CLAUDE.md`, the page's feature
docs (`docs/features/<feature>/`, especially `edge-cases.csv` and the `*.mmd` diagrams),
`docs/roadmap.md` and `docs/handover/operator-workspace-screens.md`. Find the surface's real entry
points from navigation and routes, not only the one you were named. Use the real running app and
real backend. No mocks.

**Jobs to attempt.** Derive 6–8 jobs from what your persona actually needs to get done on this page.
Include first-time setup, the most frequent task, a bulk or large-volume task, an error-recovery
task, and an "it is broken and I am under pressure" task. For each job write the pass/fail test
FIRST, then attempt it, timing it and counting clicks.

**Check every screen for**

- Empty, one, many, and a very large amount of data: search, filter, pagination, performance.
- Every state the feature can be in: never configured, configured, in progress, failed, partial,
  disabled or expired. Each needs its own clear look and next action.
- Wording: plain language for this persona, consistent terms across the product, no raw enums, error
  codes or stack traces.
- Consistency with sibling screens. Note where another screen does it better.
- Destructive or costly actions: confirmation, reversibility, consequences named before the click.
- Dead ends: buttons that do nothing, settings that save but visibly change nothing, links to missing
  pages, silent failures.
- Loading, error, success and toast behaviour. Double-submit. Leaving with unsaved changes.
- Roles, permission levels and plan tiers: what each one sees, and what is blocked without explanation.
- Narrow screens (375 px and 768 px), keyboard-only use, and friction in tasks repeated 20 times a day.
- Whether I can tell what the system is doing, and whether my action worked, without asking anyone.
- Ranza-specific: Turkish, English and Arabic (RTL) are designed with every feature — switch locale
  and look. Every inner page/detail view must carry a back button (ADR 0035).

**Rules**

- If a feature is simply not built, report it under "Not built", not as a UX defect. Check the code
  and docs (`edge-cases.csv` rows marked deferred, the roadmap) before deciding which.
- Never print secrets or personal data in the report. Passwords never go in a report or a message.

**Evidence.** Screenshot every finding. Record route/screen, role, data state and exact steps. If you
cannot reproduce it a second time, say so.

## MODE: AUDIT ONLY — change nothing

The owner gave no mode, so the default applies: **nothing you do may persist a change to the product.**
Concretely, this is staging, but the data is shared by 20 other agents and some history is never
deleted (a check-in, a posted charge, a closed day cannot be undone).

You MAY: read every screen; search, filter, sort, paginate; open every dialog, drawer and detail
view; switch locale and property; fill any form and press submit **with invalid input** to see
validation and error states; fill a valid form up to, but not including, the final submit and record
what the confirm step says.

You MAY NOT, ever: submit a valid create/edit/delete/cancel/assign/import; check in or out; close a
day; post a payment, charge, refund or adjustment; change a rate, role, permission, staff member,
password, 2FA or any setting; connect, test or sync an integration; run an export that emails or
posts anywhere; send any email, SMS, push or webhook; touch the database or the host over SSH; run
any seed script; edit any file other than your own report folder; commit; deploy.
Do not press a real submit button "with empty input" to see validation unless you have first read the
code and confirmed that browser or form validation stops it before any request is sent; otherwise
infer the validation from the code.
If a job needs one of those, stop at the confirm step, mark the job "stopped before submit — not
persisted", and judge the rest from the code and the feature docs (label it _inferred_).
Downloads of data the persona is already allowed to read are fine.

## Environment

- Workspace: `https://ranza.46-225-168-54.nip.io` (hosted staging, same code as `main` 4b15c30,
  verified identical on 2026-10-11). Guest portal: `https://ranza-portal.46-225-168-54.nip.io`.
  Locale is the first path segment (`/en`, `/tr`, `/ar`).
- Test accounts live in **`/Users/pcx/Developer/ranza/CLAUDE.local.md`** (Owner, Manager, Front Desk,
  Finance, Housekeeping). Read the file for emails and passwords. Type them into the sign-in form;
  never write them anywhere. Organization "Prizic Demo", Property "Demo Otel İstanbul".
- Staging is a demo database; it may have few or oddly shaped records. Say what data state you found.
  You cannot add data, so "very large amount of data" and "empty" are often _inferred_ from the code
  (query limits, pagination, empty-state components) — say so rather than claiming you saw them.

## Browser rules (parallel agents share one browser server — follow exactly)

Use the **chrome-devtools** MCP tools (load them with ToolSearch `select:` first, in ONE call).

1. Open with `new_page(url, isolatedContext: "<your-agent-name>-<role>")`. One isolated context per
   role you need, so you can be signed in as two roles at once without signing out.
2. Your `pageId` is the number on the line tagged with your isolatedContext. Ignore `[selected]`.
   **Never call `select_page`. Pass `pageId` on EVERY page-scoped call** — a call without it can
   screenshot another agent's tab.
3. Screenshot `filePath` must be inside the repo, and it is. Save to
   `docs/ux-audit/2026-10-11/<your-page>/NN-short-name.png`. A `.jpg` request saves as `.jpeg`.
   **Open (Read) every screenshot you cite** to confirm it shows your page.
4. **Sign-in is rate-limited to about 3 per 10 s per address, shared by all agents.** Sign in once per
   role and keep the session. If you get "too many requests", wait with
   `evaluate_script` → `await new Promise(r => setTimeout(r, 15000))` and retry once. Never loop.
5. Do not use `screencast_*` (one recording per server). Do not use other browser MCPs.
6. Resize with `resize_page` / `emulate` for 375 and 768 px; restore afterwards.
7. Run everything in the foreground. Never end your turn waiting on a background job.

## Deliverable

Write ONE self-contained HTML file: `docs/ux-audit/2026-10-11/<your-page>/report.html`
(embedded CSS, no external fonts/CDNs/scripts, screenshots as relative `<img src="NN-name.png">`).
Plain, readable, no decorative ornament. Sections, in this order:

1. **Verdict** in 5 lines: could this persona use the feature unaided? What is the biggest risk?
2. **Findings table**: ID (`<PAGE>-01` …), severity (blocks work / causes errors / slows me down /
   polish), where (route + role + data state), what happened, what I expected, suggested fix,
   effort (S/M/L), evidence (screenshot, reproduced Y/N), and whether it is _verified_ or _inferred_.
3. **Jobs table**: the job, the pass/fail test written first, result, seconds, clicks.
4. **Top changes** ranked by time saved × frequency, each phrased as an outcome ("I can see what is
   unmapped at a glance"), not a component. Up to 10; fewer is fine.
5. **Inconsistencies** with sibling screens or features.
6. **Not built / needs backend work**, kept separate from UX defects, with the doc or code that says so.
7. **What already works well and must not regress.**

Radical honesty: label each claim _verified_ (you saw it), _inferred_ (you read it in code/docs) or
_unknown_. No unearned superlatives. Do not pad. Do not invent findings to fill a table; a page with
three real problems has three rows.

## Finishing

Finish the job: every section written, every screenshot opened, report file exists. Decide
ambiguities yourself and note the assumption in one line. Only these justify stopping early: a
credential or access you cannot obtain (say which); an action the MODE section forbids (stop at the
confirm step and note it); the page being unreachable. Do not ask the owner questions.

Your final message to the orchestrator is at most 12 lines: the report path, counts of findings by
severity, the three most important findings (ID + one line), anything you could not do and why.
No passwords, no personal data.
