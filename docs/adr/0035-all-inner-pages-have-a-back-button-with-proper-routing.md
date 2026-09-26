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
   header bar remained static.
3. **Mobile viewports hid the breadcrumbs entirely.** `AppPageBar` hides the
   breadcrumb trail on small viewports (`max-sm:sr-only` / `hidden sm:flex`),
   leaving the header with no navigation context or way back.
4. **Naive `history.back()` breaks on direct entry or query changes.** A bare
   `router.back()` fails or leaves the application when a page is opened
   directly from a URL, bookmark, or new tab. Furthermore, if a user changed
   five filter parameters on the audit log, naive browser back simply undone
   one filter parameter rather than returning to the referring screen.

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
   - Modifier key preservation: Command/Control/Shift clicks open the target URL
     cleanly in a new tab.
4. **Proper routing combines in-app history with explicit fallback.**
   - When a user navigated from a different page within the application origin,
     clicking Back navigates back in browser history (`router.back()`),
     restoring the caller's view and state.
   - When a page is accessed directly, refreshed, or opened from an external
     source (no in-app referrer from a different page), clicking Back routes
     to a deterministic fallback destination.
   - For top-level inner pages, the fallback destination is `Today`,
     preserving the active Property query parameter (`?property=...`).
   - For entity detail views (such as `?record=` or `?folio=`), the fallback
     destination is the parent list view with any existing filter parameters
     retained.
   - History is bypassed when navigating between filter states on the same
     page, ensuring the header back button exits the screen rather than
     stepping through single filter queries.
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
- Localized message catalogues in both `@ranza/operator-workspace` and
  `@ranza/guest-portal` include `back` across all three supported languages.
