# 0035. All inner pages have a back button with proper routing

Date: 2026-09-25

Status: Accepted

Amends [ADR 0013](0013-an-interface-is-shadcn-a-feature-folder-and-a-shared-kit.md).

## Context

The workspace shell (ADR 0013, adapted from Leaders portal and mirhaal)
structured navigation around two surfaces: the persistent sidebar rail
(`WorkspaceRail`) and the top bar (`AppPageBar`) showing the breadcrumb trail
(`WORKSPACE > [Group] > Page Title`).

A review of how operators move through the workspace highlighted an omission:
**no inner page had a back button in the header bar.**

1. **Top-level operational screens were dead ends for reverse navigation.** A
   user navigating from Today or Reservations into the Audit Log (`/audit-log`)
   had no back control in the header to return to where they came from. The rail
   allowed jumping across modules, but reverse workflow movement was absent.
2. **Sub-views and detail records relied on tiny inline body links.** The audit
   record panel (`?record=...`) and the folio viewer (`?folio=...`) placed a
   small text link (`All records` or `All folios`) in the page body, but the
   header bar remained static. The audit one also dropped the list's filters.
   Those links are removed; the header control replaces them.
3. **Mobile viewports hid the breadcrumbs entirely.** `AppPageBar` hides the
   breadcrumb trail on small viewports (`max-sm:sr-only` / `hidden sm:flex`),
   leaving the header with no navigation context or way back.
4. **History is the wrong source for a header control.** `history.back()`
   leaves the application when a page was opened from a bookmark or a new tab,
   and undoes a filter change rather than leaving the screen. Nor can the
   application tell where somebody came from: the workspace stays one document
   across page switches, so `document.referrer` is fixed at the first load, and
   the full loads that do change it — switching the language or the Property —
   are exactly the ones "Back" must not undo.

## Decision

1. **The workspace root is `Today`; every other destination is an inner page.**
   `Today` (`/[locale]/today`) is the home operations dashboard and displays no
   back button. Every other destination (`/audit-log`, `/reservations`,
   `/rooms`, `/arrivals`, `/departures`, `/housekeeping`, `/finance`,
   `/people`, `/security`, `/configuration`, etc.) and any entity drill-down
   view (such as `?record=` or `?folio=`) is an inner page and must display a
   back button.
2. **`AppPageBar` accepts a `back` slot at its leading edge.**
   The back control sits immediately before the breadcrumb trail, providing a
   consistent landmark across desktop and mobile screens.
3. **`BackButton` belongs to the shared kit (`packages/ui`).**
   A reusable component supporting:
   - Accessible label localized across English ("Back"), Turkish ("Geri"), and
     Arabic ("رجوع").
   - Logical icon mirroring: an arrow with `rtl:rotate-180` so Arabic displays
     the correct reverse direction by construction.
4. **Back goes up one level, deterministically.** It is a link, never
   `history.back()`:
   - A detail view (`?record=`, `?folio=`) goes to its list, keeping the rest of
     its query — the Property and any filters.
   - Every other inner page goes to `Today`, with the active Property kept
     (`?property=...`).
   - The browser's own Back button remains the history control. Returning to
     the previous in-app destination would need the workspace to track its own
     navigation depth; that is a separate decision, not a property of this
     button.
5. **`WorkspacePageBar` automates back button resolution.**
   Rather than requiring each feature route to manually instantiate page bar
   navigation, `WorkspacePageBar` inspects the route and query parameters,
   computes the appropriate fallback href, and attaches `BackButton`
   automatically.

## Consequences

- Every inner page in the Operator Workspace now displays a back button
  without code changes in individual feature screens.
- Deep links and shared URLs (e.g. sharing an audit log record or folio)
  provide a safe way back to the parent list even when opened in a fresh tab.
- Mobile headers gain a visible back button while preserving space for page
  actions.
- The Operator Workspace's message catalogue carries `back` in all three
  languages.
