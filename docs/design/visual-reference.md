# Visual reference specification

Static HTML mockups used as design reference for the Operator Workspace. They are
**not** production code and ship no JavaScript behaviour — they exist so screen
layout, density and vocabulary are agreed before components are built.

Authority: [`../RANZA_PRODUCT_BLUEPRINT.md`](../RANZA_PRODUCT_BLUEPRINT.md) and
[`../adr/`](../adr). Where this file and the blueprint disagree, the blueprint wins.

## Non-negotiables

### 1. Vocabulary

Section 2 is binding **in interfaces**, not only in code. A mockup using the wrong
word is wrong, because its labels become component copy.

| Never                         | Always                                      |
| ----------------------------- | ------------------------------------------- |
| Branch                        | **Property**                                |
| Operator, Dormitory Operator  | **Organization**                            |
| Student (as a top-level user) | **Resident** — a Student is a Resident type |
| Tenant                        | **Organization**                            |
| Customer                      | **Organization**, or Guest/Resident         |

Prizic operations never appear in the Operator Workspace. No "platform", "support
context" or Prizic branding anywhere in these screens — that is the Control Plane.

### 2. Only show what exists or is specified

Every number, column and control must trace to the blueprint or the schema in
`prisma/schema.prisma`. Do not invent modules, metrics or statuses.

Currently in the database: Organization, Property, users, auth identities,
organization memberships, property assignments, subscriptions, entitlements,
property capabilities. Accommodation Units, Reservations, Stays and Folios are
**specified but not yet built** — they may appear in mockups, drawn from blueprint
sections 5.2, 5.3 and 5.9, and must use that language exactly.

### 3. Entitlements are visible in the design

Section 3.5: hiding a control is never the security boundary, but navigation shows
only entitled and permitted capabilities. Unavailable modules do not clutter
operational navigation — owners reach them through a separate **Explore modules**
area (section 4.6). Never draw a locked or upsell item in the main nav.

### 4. Status never relies on colour alone

Section 18.5: every state combines colour with text, icon, or shape. A green dot
alone is a defect. This applies to occupancy, readiness, payment and task states.

### 5. Localisation is structural

Turkish is the primary language, and Arabic is RTL. Use logical CSS properties
(`margin-inline-start`, not `margin-left`) so mirroring works. Assume Turkish
labels run ~30% longer than English — no layout may depend on short labels.
Numbers, dates and currency are locale-formatted; Property-local business dates
matter (section 10).

## Design tokens

**This file wins.** The palette is the Leaders portal's, matched rather than
paraphrased — a deep emerald accent and a warm cream secondary on a white
canvas, white panels lifted by a hairline and a long soft shadow, generous
radii, and Geist. It replaced the teal-on-pale-canvas palette of the first
approved mockups on 2026-09-22, so those mockups are still right about layout
and density and no longer right about colour. On 2026-09-24 the ivory canvas
and IBM Plex of that first pass gave way to Leaders' own white canvas and
Geist, on the direction that the Leaders portal is the source of truth.
[`packages/ui/src/styles/globals.css`](../../packages/ui/src/styles/globals.css)
holds these values. Do not edit the values below to match the code — the
traffic runs the other way.

The first brief asked for `Aptos`, which is not licensed for the web and would
fall through to a system font on every machine that is not Windows. The theme
sets Geist instead, as Leaders does, for Turkish and English — loaded with its
Latin Extended subset, so ğ, ş, ı and İ are drawn by Geist rather than
borrowed mid-word from another face. Geist draws no Arabic, so an Arabic page
leads with IBM Plex Sans Arabic; the reason is recorded beside the stack in
`globals.css`.

See also [`ui-references.md`](ui-references.md) for layout and interaction, and
[ADR 0013](../adr/0013-an-interface-is-shadcn-a-feature-folder-and-a-shared-kit.md)
for how components are organised.

```css
--canvas: #ffffff;
--canvas-deep: hsl(170 10% 96%);
--ink: hsl(170 60% 10%);
--ink-muted: hsl(170 5% 45%);
--accent: hsl(172 65% 20%);
--accent-soft: hsl(38 60% 95%);
--surface: #ffffff;
--surface-strong: hsl(170 60% 10%);
--success: #176842;
--success-soft: #dcefe3;
--warning: #8a5a08;
--warning-soft: #f7e8c8;
--danger: #a33a35;
--danger-soft: #f5dfdd;
--info: #315f83;
--info-soft: #dfeaf2;
--sign-in-canvas: #fbfaf8;
--sign-in-ink: #474747;
--sign-in-ink-muted: #72716f;
--sign-in-field: #d9d9d9;
--sign-in-cta: #1f1e1c;
--gold: #e4b763;
--gold-ink: #8a684d;
--line: hsl(170 10% 90%);
--line-strong: hsl(170 10% 80%);
--focus: hsl(172 65% 20%);
--radius: 1rem;
--shadow: 0 20px 60px rgba(0, 0, 0, 0.06);
--shadow-low: 0 4px 14px rgba(10, 41, 36, 0.04);
font-family: Geist, "IBM Plex Sans Arabic", system-ui, sans-serif;
/* Arabic: "IBM Plex Sans Arabic", system-ui, sans-serif */
```

Accent is used for primary action and identity, not decoration. Surfaces are
white on a white canvas, so separation comes from the floating panels' hairline
and long shadow and from `--line`, not heavy borders. Data tables use
`font-variant-numeric: tabular-nums`.

The sign-in screen has a palette of its own, which is Leaders' login: an ivory
ground, charcoal type and a near-black call to action. Its muted grey is
Leaders' `#8c8b89` darkened to clear 4.5:1 on the ivory. `--gold` fills the
sign-in swoosh and nothing else — it sits well below even the 3:1 large-text
floor on the canvas and never carries text.
Copy set in the brand's bronze uses `--gold-ink`, which is the reference's
`#a48166` darkened to clear 4.5:1.

### Where Ranza departs from Leaders, and why

Everything not listed here is Leaders' own value or class. A departure without
an entry is a bug.

- **Contrast.** `--danger` is `#a33a35`, not Leaders' `hsl(0 70% 60%)`, which
  is below 4.5:1 on white; the sign-in greys above are darkened for the same
  reason.
- **Arabic** is set in IBM Plex Sans Arabic, because Geist draws none.
- **Sign-in** has no padlock and no "protected by security protocols" line —
  the page does not demonstrate either — and no Leaders logo figure behind it,
  which is another company's mark. It has no "forgot password" link, because
  Ranza has no reset flow and a link to nowhere is worse than none. Its service
  row names Ranza's built screens.
- **Sidebar.** Ranza has destinations nested under a group (Front Office), and
  Leaders has no pattern for them, so a group opens as an indented list. The
  sidebar also folds to icons, which Leaders' does not, and tightens its rows
  below 960px of height where Leaders waits for 800px: twelve destinations to
  Leaders' nine would otherwise scroll off a laptop screen.
- **Phones.** Below `md` the pages of a group sit under the page bar as a tab
  strip, because the dock at the foot opens a group on its first page only.

## Accessibility

- Every interactive element reachable and visible on keyboard focus, `--focus` ring.
- Real landmarks: `header`, `nav`, `main`, and a skip link.
- Tables use `<th scope>` and a caption or `aria-label`.
- Contrast at least 4.5:1 for text.
- Touch targets at least 44px for anything used on a phone.

## Fixture data

Realistic Turkish student-housing data, since that is the live prospect — but drawn
as a **Property configuration**, never as a separate product (ADR 0004).

- Organization: **Boğaziçi Konukevleri**
- Properties: **Galata Rezidans**, **Kadıköy Rezidans**, **Beşiktaş Rezidans**
- Staff: Elif Kaya (owner), Deniz Arslan (manager)
- Residents: Turkish and international names, mixed script
- Currency ₺, dates `16 Eyl 2026`, timezone Europe/Istanbul

## Output rules

- One self-contained `.html` file per screen, inline `<style>`, no build step.
- **No JavaScript.** Interactive states are shown as separate static variants.
- Semantic HTML, no `div` soup.
- Desktop 1440px primary; include the responsive behaviour described per screen.
- Save to `docs/design/mockups/<screen>.html`.

---

# Screen 01 — Today (Operator Workspace home)

The first screen a Staff Member sees. Blueprint section 18.4: a dashboard is an
operational entry point, not a decorative analytics collection. **Every card must
open the filtered records and primary action that resolve it** — draw them as
obviously clickable, each with an explicit action affordance.

## Shell (persists across all Operator Workspace screens)

- **Sidebar on the start edge**, a white panel floating in its own padded
  column, sectioned, collapsible to icon tiles — the Leaders portal's rail.
  _Superseded the 76px icon rail this brief first described._ The **Property
  switcher** moved to the page bar,
  where there is room for a name; it must still be obvious which Property is
  active at all times (section 7.2 user story 10).
- **Job-based navigation** (section 4.6), not a flat module list. For this screen
  show only: Today, Front Office, Housekeeping, Residents, Billing, Reports,
  Configuration. Do not draw modules the Organization is not entitled to.
- **Page bar:** a floating bar carrying the trail (Workspace › group › page),
  the section's sibling pages, the Property switcher and the language switcher;
  the page's title is set large and light under it. Global search, the business
  date and notifications are still wanted here and not yet built.
- Skip link, `main` landmark, focus states.

## Page content

**Heading:** `Bugün · Galata Rezidans` with the full localised date beneath.
Turkish is the primary language — use Turkish labels with an English gloss in a
comment so reviewers can follow.

**Exception cards, not vanity metrics.** Five cards across, each stating a number,
a label, a short qualifier, and a clear "opens this list" affordance:

1. Doluluk (Occupancy) — `82%`, `184 / 224 beds`
2. Bugün gelenler (Arrivals today) — `18`, `7 checked in`
3. Bugün çıkanlar (Departures today) — `12`, `9 completed`
4. Hazır yataklar (Beds ready) — `31`, `4 being cleaned`
5. Açık sorunlar (Open issues) — `6`, `2 urgent` — use `--danger` treatment with
   an icon **and** the word, never colour alone

**Primary work queue (left, ~2/3):** "Bugünkü hareket" with tabs for Arrivals and
Departures. Table columns: Resident, Reservation reference, Room and bed,
Readiness, Balance, Action. Readiness values: `Hazır` (ready, success),
`Temizlikte` (cleaning, warning, with an estimated time), `Belge eksik` (documents
missing, danger). Each row's action is a single clear verb — `Check in`, `Wait`,
`Review` — and a disabled action must look disabled and say why.

**Right column (~1/3), two stacked cards:**

- **Kat hazırlığı (Floor readiness)** — four floors, each a labelled progress bar
  with `48 / 52 ready` style counts. Bars need text values, not just fill.
- **Dikkat gerekiyor (Needs attention)** — 4 items, each with severity (icon +
  word), a one-line description, and the owning module as a tag: Maintenance,
  Billing, Inventory, Housekeeping. Each row opens that record.

**Bottom, full width:** "Önümüzdeki 14 gün doluluk" — a simple static line chart,
14 points, y-axis 0–100%, with the average called out numerically beside it. Draw
the chart as inline SVG. Include a visually-hidden data table of the same values,
because a chart alone is not accessible.

## States to include as separate static variants, below the main layout

1. **Empty** — a Property with no arrivals today. Use a real empty state with a
   heading, one line of explanation, and the most useful next action. Never an
   empty table with just headers.
2. **Entitlement-limited** — the same screen for an Organization without the
   Billing entitlement: the Billing nav item and the Balance column are simply
   absent, not greyed out or badged. Add a brief note explaining that hiding is
   presentation only and the server and database still deny (section 3.5).

## Responsive

At 768px the sidebar collapses to an icon rail with the Property switcher
remaining visible and labelled; cards stack two-up; the work queue becomes a card
list where each row shows Resident, room, readiness and the single primary action.
