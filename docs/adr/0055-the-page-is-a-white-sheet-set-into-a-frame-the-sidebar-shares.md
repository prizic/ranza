# 0055. The page is a white sheet set into a frame the sidebar shares

Date: 2026-10-19

Status: Proposed

Amends [ADR 0013](0013-an-interface-is-shadcn-a-feature-folder-and-a-shared-kit.md).
Touches [ADR 0046](0046-an-organization-brands-the-portal-with-one-colour-and-one-logo.md).

## Context

The shell was the Leaders portal's: a white canvas, a glass sidebar floating in
its own padded column, and a glass page bar floating above the content. Three
things about it did not serve Ranza.

1. **The sidebar and the page competed.** Both were white panels on a white
   canvas, separated only by a hairline and a shadow, so neither read as the
   frame and neither as the work. Ranza has a dozen destinations in the
   sidebar, and the one thing on screen that should look like the work — the
   page — looked like one more floating card.
2. **The brand disappeared on the largest surface.** ADR 0046 draws a brand
   from `--primary`, which the shell used only for the active navigation item
   and buttons. The colour the product is most recognised by covered almost
   none of the screen.
3. **Two floating bars cost vertical room.** The page bar, its margin and the
   sidebar's padding sat on top of the content on every screen.

The owner's reference was a dashboard in which the sidebar and the margin are
one saturated surface and the page is a single white sheet inset into it. A
static mockup in Ranza's own colours is
[`docs/design/mockups/shell-inset.html`](../design/mockups/shell-inset.html).

## Decision

1. **The frame is the primary colour, and the sidebar is part of it.** The
   sidebar has no panel, border or shadow. The margin around the page is the
   same surface, so the two read as one.
2. **The page is one white sheet** with a large radius (`--sheet-radius`). The
   page bar moves inside it as its head, divided from the content by a hairline;
   the back button of ADR 0035 stays at its leading edge.
3. **The frame is drawn from `--primary` and `--primary-foreground` at the point
   of use**, as the tokens `frame`, `on-frame`, `on-frame-muted`, `frame-line`,
   `frame-hover` and `frame-active`. Because they are not restated on `:root`,
   an Organization's brand (ADR 0046) repaints the frame, and its derived
   foreground keeps the text readable on a light brand colour.
4. **Everything on the frame is drawn in the `on-frame` tones, and its focus ring
   is `on-frame`.** The product's emerald ring would be invisible on the emerald.
   Inactive items are the foreground at 74%, which is about 7:1 on the default
   emerald; the active item is the foreground on a 15% fill. Contrast on a brand
   colour is the brand's own derivation, not something this ADR guarantees.
5. **The page scrolls as the document does**, not inside the sheet, so sticky
   elements, scroll restoration and anchor links behave as on any page. The
   frame and sheet are capped at 1920px, centred, with the frame's colour
   filling the rest.
6. **On a phone there is no frame.** Below `md` the sheet is the page, full
   bleed, and the dock at the foot keeps the frame's colour so the identity
   carries over.
7. **`glass-panel` is removed.** Nothing else drew from it.

## Consequences

- Every screen of both applications changes arrangement without a change to
  its own code: the shell is `AppShell`, `AppSidebar`, `AppPageBar`,
  `AppBottomNav` and `AccountMenu` in `packages/ui`, and the theme tokens.
- The page loses about 12px of width on the end side and 12px above and below
  at `md` and wider. The widest screens — the room calendar and the
  housekeeping and maintenance boards — must be checked before this is
  accepted.
- ADR 0046 names the active navigation item as what a brand colour fills. It
  is now the frame, and `branding.spec.ts` asserts the frame's colour and the
  text on it instead; with the shell's brand tokens removed, BR-S1-01 and
  BR-S1-12 go red on the default emerald.
- Sidebar section headings are not part of this change. The sections are
  separated by a rule, as before.
- This departs from the Leaders portal, which `visual-reference.md` names as
  the source of truth for the shell. The departure is recorded there, and
  becomes `Amended:` only when the owner accepts it.
- A near-black frame (`--surface-strong`) is a change to the one `--color-frame`
  line, but then `on-frame` must be set to match; a brand colour would no longer
  repaint it.
