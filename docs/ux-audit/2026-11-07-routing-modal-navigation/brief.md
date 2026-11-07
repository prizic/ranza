# Routing, modal and navigation audit — shared brief

Read-only audit of the Ranza operator workspace (and guest portal) at `origin/main` 49ae2cc4.
Read the code in `/Users/pcx/Developer/ranza-rooms-open-stay` (a worktree; it is yours to read, not to change).

## Why this audit exists

On the Rooms screen, pressing an occupied room's tile opened a dialog headed "Room details" that only said
"occupied, cannot block": no way to the stay, a label promising more than the dialog held. It is fixed
(`features/rooms/components/block-unit-dialog.tsx`, `stayHref`; the link is offered only if the viewer may open
Reservations, via a `reservationsHref` that is null otherwise; `?open=<reservationId>` is the existing deep link
into the Reservations detail sheet). Your job: find the SAME CLASS of defect everywhere in your lane.

## The defect classes (tag each finding with one)

- **DEAD-END** — a dialog/sheet/panel/row that explains a refusal or shows read-only facts with no way forward
  (no link to the thing it is about, no next action).
- **LABEL** — a label, chevron or button text that promises more than the destination delivers ("details" that
  shows almost none; "Manage" that is read-only for this viewer).
- **GATE** — a link or button offered to a viewer who cannot open the destination (screen gate, permission,
  property scope, plan), or a link built with a null/undefined id. Compare how `housekeepingHref` and
  `reservationsHref` are computed with `screenProperties(gateOf(..))` in `app/[locale]/(workspace)/rooms/page.tsx`.
- **NO-HOME** — an entity named on screen (guest, stay, reservation, room, request, folio, staff member) with no
  link to the place where it lives.
- **BACK** — an inner page or detail view without the back button ADR 0035 requires
  (`docs/adr/0035-*.md`: a link one level up, keeping the active Property, never `history.back()`, mirrors in RTL),
  or a back that goes to the wrong parent, or drops `?property=`.
- **DEEPLINK** — a deep-link parameter (`?open=`, `?unit=`, `?report=`, `?show=`, `?q=`, `?view=`, `?property=`)
  that is ignored, silently does nothing when the target is filtered out / paged out / not on the list, or is
  lost on a refresh or a property switch.
- **MODAL** — wrong container for the job (a dialog where a page or sheet is right, or the reverse); state lost
  when the page auto-refreshes while open; nested dialogs (known trap: inner dialog becomes aria-hidden);
  dismiss/Escape/focus-return broken; a form that resets on a refused submit; RTL chevrons not mirrored.
- **STEPS** — the common action costs more clicks than it should, or a gesture exists with no visible affordance.

## Rules in force (do not contradict)

- `CLAUDE.md` (repo root) and `CLAUDE.local.md`: vocabulary (Organization, Property, Resident — never Operator,
  Branch, tenant); Tailwind + shadcn only; directional utilities logical; TR/EN/AR designed together.
- Continuous-UX rule: a _tweak to existing behaviour_ (visibility, hit area, copy, default, prefill, a link from one
  more natural place) is fixable now; a _new interaction_ (new quick action, drag-to-create, bulk edit) is a
  proposal needing the owner's approval. Classify every finding as TWEAK or PROPOSAL accordingly.

## How to work

- Read the code; do not run the app, the dev server, a browser, tests, or any database. Say **verified** only for
  what you read in the file (give `path:line`); say **inferred** for anything reasoned but not read; never guess.
- Skip what the code proves is fine. Report only real defects; fewer, true findings beat a long list. No style nits.
- Before reporting, `grep -ril "<distinctive words>" /Users/pcx/Developer/ranza/docs/ux-audit` for a prior finding
  (that audit is of an older SHA; mark `known: <file>` if already listed, but still list it if it is still present).
- Do not re-read files this brief already summarises. Do not read outside your lane except to follow a link target.
- Do NOT modify any file in the repo, and do NOT run `git checkout/stash/commit/add`. Your only write is your
  findings file.

## Output

Write `/private/tmp/claude-501/-Users-pcx-Developer-ranza/ad2cc2d4-4fa8-4ee9-a24d-f28a471f3efb/scratchpad/audit-<LANE>.md`:

    ### <LANE>-NN · <CLASS> · <TWEAK|PROPOSAL> · severity <high|medium|low> · <verified|inferred>
    - Where: screen, `path:line`
    - What happens: one or two sentences, what the person sees and does
    - Why it is wrong: one sentence
    - Fix: one sentence (name the existing link/route/helper to reuse, with `path:line`)

Order by severity. End with a short "Checked and fine" list (screens/dialogs you traced that are correct) so
coverage is visible. Then reply with at most 250 words: counts by class, the five worst, anything blocked.

Finish the job: trace every dialog, sheet, tile, row action and link in your lane before stopping. Stop early only
for a credential/access you cannot get, or a decision only the owner can make; say which.
