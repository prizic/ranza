# Prompt for generating Operator Workspace visuals

Paste the block below into ChatGPT. It is self-contained — the model has no
access to this repository, so everything it needs is restated. Ask for **one
screen per message**, in the order listed, and review before moving on.

---

You are designing screens for **Ranza**, a multi-tenant, white-label
accommodation and hospitality ERP used by businesses that operate one or more
accommodation properties: hotels, hostels, student residences, serviced
residences and staff housing. This is the **Operator Workspace** — the main
authenticated web application used by the operating team.

Produce a **high-fidelity UI mockup image** for the one screen I name. Desktop,
1440×1024, unless I say otherwise.

## Vocabulary — this is binding, and getting it wrong makes the design unusable

| Never use                    | Always use                                       |
| ---------------------------- | ------------------------------------------------ |
| Branch                       | **Property**                                     |
| Operator, Dormitory Operator | **Organization**                                 |
| Student (as a user type)     | **Resident** — a Student is one kind of Resident |
| Tenant                       | **Organization**                                 |
| Customer                     | **Organization**, or Guest / Resident            |

Other exact terms: **Accommodation Unit** (a sellable or assignable space — room,
bed, apartment), **Stay** (the record connecting a Guest or Resident to a unit for
a period), **Reservation** (a planned allocation that becomes a Stay),
**Folio** (the financial record collecting charges and payments),
**Entitlement** (permission for an Organization to use a module),
**Staff Member**.

An Organization operates several Properties. A Staff Member is scoped to the
Properties they are assigned to.

## Visual system — use these exact values

```
canvas        #f3f6f4      canvas deep   #e6ece9
ink           #132f38      ink muted     #52656b
accent        #087466      accent dark   #05594f     accent soft #d9eee9
surface       #ffffff      surface strong #132f38
success       #176842 / soft #dcefe3
warning       #8a5a08 / soft #f7e8c8
danger        #a33a35 / soft #f5dfdd
info          #315f83 / soft #dfeaf2
line          #c8d3d0      line strong   #9caca8     focus ring  #126bad
radius        7px small, 12px default, 18px large
shadow        very soft, low opacity, never heavy
font          humanist sans (Aptos, Segoe UI Variable, Inter). Arabic: Noto Sans Arabic
```

White surfaces on the soft green-grey canvas. Separation comes from hairline
borders and very soft shadows, never heavy boxes. Accent green is for primary
action and identity only — never decoration. Numbers in tables use tabular
figures. Dense but calm: this is a tool used all day, not a landing page.

**Avoid:** gradients, glassmorphism, neon, drop shadows on text, purple/indigo
SaaS clichés, rounded pill everything, dark mode (unless I ask), emoji, stock
avatars, decorative illustration.

## Rules the design must follow

1. **Status never by colour alone.** Every state pairs colour with a word, an
   icon, or a shape. A bare coloured dot is a defect.
2. **Dashboards lead to action.** Every metric or exception card must obviously
   open the filtered records that explain it. No decorative statistics.
3. **Navigation is job-based, not a module dump.** Group by the work being done.
4. **Only entitled capabilities appear in navigation.** Never draw greyed-out or
   locked upsell items in the main nav — unavailable modules simply are not there.
5. **Turkish is the primary language.** Use Turkish labels, and assume Turkish
   text runs ~30% longer than English — no layout may depend on short labels.
   Arabic is supported and right-to-left, so keep layouts mirror-friendly.
6. **Accessible by construction.** Visible focus states, real table headers,
   text contrast at least 4.5:1, touch targets ≥44px on anything used on a phone.
7. **Realistic data, never lorem ipsum.** Turkish and international names,
   ₺ amounts, dates like `16 Eyl 2026`, Europe/Istanbul times.
8. **Invent nothing.** No modules, metrics, statuses or pricing beyond what I
   describe. If something seems missing, leave it out and say so.

## Fixture data to reuse across every screen

- Organization: **Boğaziçi Konukevleri**
- Properties: **Galata Rezidans**, **Kadıköy Rezidans**, **Beşiktaş Rezidans**
- Signed-in Staff Member: **Elif Kaya**, Organization owner
- Other staff: Deniz Arslan (manager), Selin Acar
- Residents: Aylin Demir, Mert Kaya, Leyla Al-Hassan, Omar Rahman, Sofia Rossi

## Persistent shell — present on every authenticated screen

- Left sidebar, dark (`#132f38`), ~260px: Ranza wordmark, the Organization name
  beneath it, then a clearly labelled **Property switcher** showing the active
  Property. It must always be obvious which Property is active.
- Job-based navigation. Show only: **Bugün** (Today), **Ön Büro** (Front Office),
  **Kat Hizmetleri** (Housekeeping), **Sakinler** (Residents), **Finans**
  (Finance), **Raporlar** (Reports), **Ayarlar** (Configuration).
- Top bar: global search, the active Property's business date, a language
  switcher showing TR active, notifications, and the signed-in Staff Member.

---

## Screens — ask for these one at a time

**Built or being built now:**

1. **Sign in** — email and password, Ranza branding, language switcher, no shell.
2. **Bugün / Today** — the operational home. Exception cards (occupancy, arrivals,
   departures, units ready, open issues), a primary work queue of today's
   arrivals with a single clear action per row, a readiness summary, and an
   "needs attention" list tagged by owning module.
3. **Properties** — the Organization's Properties with occupancy, staff count and
   status. This is the Organization-level view, above any single Property.
4. **Staff and access** — Staff Members, their role, and which Properties each is
   assigned to. Shows that access follows assignment.
5. **Explore modules** — entitled modules versus those available to add. This is
   the _only_ place unavailable capabilities appear.
6. **Empty state** — Today for a Property with no arrivals: a heading, one line of
   explanation, and the most useful next action. Never an empty table.
7. **Access denied** — a Staff Member opening a Property they are not assigned to.
   Explain plainly without leaking whether that Property exists.

**Specified but not yet built — design from the description only:**

8. **Reservations timeline** — a calendar/timeline of Accommodation Units by date
   as the primary view, with a persistent side drawer showing the selected
   Reservation, Guest, unit, Folio and notes. Conflict preview before a move.
9. **Guest / Resident profile** — one governed workspace: identity, current and
   past Stays, preferences, requests, Folio balance, consent and privacy state.
10. **Housekeeping, mobile** — 390×844 phone. A task-first work queue for a
    housekeeper: current assignment, location, priority, required evidence, and
    one primary state transition. Not a compressed desktop dashboard.
11. **Folio detail** — charges, taxes, credits and payments on one account, with
    corrections shown as reversing entries rather than edits.

Start with screen 1 and wait for my notes before continuing.
