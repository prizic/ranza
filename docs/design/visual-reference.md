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

Use these exact values. They are the real tokens from `packages/ui/src/tokens.css`
and must not be substituted.

```css
--canvas: #f3f6f4;
--canvas-deep: #e6ece9;
--ink: #132f38;
--ink-muted: #52656b;
--accent: #087466;
--accent-dark: #05594f;
--accent-soft: #d9eee9;
--surface: #ffffff;
--surface-strong: #132f38;
--success: #176842;
--success-soft: #dcefe3;
--warning: #8a5a08;
--warning-soft: #f7e8c8;
--danger: #a33a35;
--danger-soft: #f5dfdd;
--info: #315f83;
--info-soft: #dfeaf2;
--line: #c8d3d0;
--line-strong: #9caca8;
--focus: #126bad;
--radius-sm: 0.45rem;
--radius: 0.75rem;
--radius-lg: 1.15rem;
--shadow: 0 1.25rem 3.25rem rgb(19 47 56 / 10%);
--shadow-low: 0 0.5rem 1.5rem rgb(19 47 56 / 8%);
font-family: Aptos, "Segoe UI Variable", "Noto Sans Arabic", sans-serif;
```

Accent is used for primary action and identity, not decoration. Surfaces are white
on a soft canvas; separation comes from `--line` and `--shadow-low`, not heavy
borders. Data tables use `font-variant-numeric: tabular-nums`.

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

- **Left sidebar, dark (`--surface-strong`), ~260px.** Ranza wordmark, then the
  Organization name beneath it, then a **Property switcher** — a labelled control
  reading `Property` showing the active Property. It must be obvious which
  Property is active at all times (section 7.2 user story 10).
- **Job-based navigation** (section 4.6), not a flat module list. For this screen
  show only: Today, Front Office, Housekeeping, Residents, Billing, Reports,
  Configuration. Do not draw modules the Organization is not entitled to.
- **Top bar:** global search ("Search residents, reservations, rooms"), business
  date for the active Property, language switcher showing `TR` as active, a
  notifications control, and the signed-in Staff Member with role.
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
