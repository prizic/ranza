# 0013. An interface is shadcn, a feature folder, and a shared kit

Status: Accepted
Date: 2026-09-16

## Context

The applications have six routes between them and are about to gain many more:
blueprint 18.4 asks for an operator home built from exception tiles, 18.6 asks
for a Reservation timeline with a persistent drawer and an action cluster, and
the approved mockups add a Property list, a staff-and-access table, a Resident
profile with tabs, module discovery and a mobile Housekeeping surface.

Two things forced the decision now.

**The screens that exist do not look like the screens that were designed**, and
the gap is mostly structural rather than cosmetic. Every mockup has a rail down
the side; `AppShell` was a top bar. Every mockup uses tables with row actions,
KPI tiles, status badges, tabs and a detail drawer; none of those exist. Adding
them ad hoc, one screen at a time, is how a codebase ends up with four table
implementations.

**There is a working example to copy rather than invent.**
`ryadh/mirhaal/apps/dashboard` is a production dashboard with the same stack —
Next, Tailwind v4, shadcn, RTL — whose component organisation has already
survived twenty features. Borrowing a proven arrangement is cheaper and better
than deriving one, and section 12 of the blueprint asks for exactly that
preference.

## Decision

### Three layers, and a file's layer is decided by how many callers it has

```text
packages/ui/src/components/ui/     shadcn. Owned source, edited freely.
packages/ui/src/components/        the shared kit — used by both applications
apps/<app>/src/features/<domain>/  one domain's screens — used by one
```

A component moves **up** when a second caller appears, never before. A table
column definition for Reservations has one caller and stays in the feature; the
data-table it is fed to has many and lives in the kit.

The kit is what `packages/ui` already is, so this mostly names a rule that was
being followed by accident. `features/` is new, and it exists because a route
file should compose a screen, not contain one — the mockups' screens are
several hundred lines each.

### A feature folder has a fixed anatomy

```text
features/reservations/
  components/reservations-table.tsx   the table
  components/columns.tsx              column definitions
  components/reservation-panel.tsx    the detail or edit drawer
  components/reservation-actions.tsx  row actions
```

Taken from mirhaal unchanged. The value is that a reader looking for "where is
the edit form for X" never has to search.

**A feature component is presentational.** It receives its data as props from
the route, which got it from `src/server/`. That is not a style preference:
ADR 0007 makes reaching the database outside the server funnel a build failure,
and `.dependency-cruiser.cjs` enforces it for every path under `src/` that is
not `src/server/`. Feature folders fall under that rule automatically.

### The shell is ported too, and that cost the framework-free rule

`AppRail`, `AppBottomNav` and `AppPageBar` are mirhaal's, not a shell built to
resemble them. The rail reads the pathname to mark the current destination, so
`@ranza/ui` gained `next` as a peer dependency — reversing an earlier decision
here that the package stay framework-free, which had been routed around with a
slot the host filled. The slot was the more complicated of the two.

It also removed a class of bug. The shadcn sidebar it replaced positions itself
`fixed` from a physical `side` prop, which `shadcn migrate rtl` rewrites to
logical properties and thereby double-flips in Arabic. A rail that is an
ordinary flex sibling mirrors because the document does, with nothing to get
wrong.

The navigation tree stays in the host: every entry carries an icon component, so
a tree cannot cross the server/client boundary. The server sends the entitled
capability keys as strings and the host's own client module turns them into
entries.

### Tables are TanStack Table, and the kit is ported rather than rewritten

`@tanstack/react-table` v8, behind one `DataTable`, with the column header,
faceted filter, pagination, row actions and view options as separate pieces.
This is mirhaal's implementation carried across, not a reimplementation of its
shape: the behaviours worth having are the ones a rewrite leaves out. A row
click that ignores clicks on controls inside a cell. A guard against the click
that dismissed an overlay landing on the row underneath it. Empty and no-matches
told apart. A search placeholder named after the columns it actually reads. A
capped list saying so, because a silently truncated table looks exactly like a
complete one.

Two things changed on the way. Every string became a prop, because that dashboard
is Arabic-only and hardcodes them while this product has three locales and no
fallback. And the phone normalization in its search helper was dropped — those
are Saudi dialling rules, and Ranza has no phone column to match yet. The
Arabic-Indic digit folding was kept, and Turkish case folding added, because
`toLowerCase()` maps İ and I wrongly in the language this product leads with.

The CSV toolbar was left behind until a screen asks for it.

### A status is a token, not a colour picked per screen

Status colours live in the theme as four semantic tones — `success`, `warning`,
`danger`, `info` — each a foreground and a soft fill it stays legible on. A
screen maps its own statuses onto them; a fifth meaning needs a fifth token, not
a one-off colour class.

`StatusBadge` takes an icon and a label as **required** props, so there is no
way to render one without them.

This is also how blueprint 18.5 is satisfied by construction: a badge is an
icon, a label and a colour together, so it survives being printed, exported or
read aloud. A screen that reaches for a raw colour class to mean something is a
defect.

### Directional utilities are always logical

`ps`/`pe`, `border-s`, `text-start`, `ms-auto`. Arabic then mirrors by
construction rather than through a second stylesheet, which is what blueprint
9.5 requires and what a retrofit never quite achieves. `shadcn migrate rtl` is
run after every `shadcn add`.

## Consequences

`packages/ui` grows a real surface — a dozen shared components rather than four
primitives — and that is the point: it is the only place both applications can
agree, and the Guest Portal gets the same table and the same badge as the
Workspace for free.

The palette question is settled against the implementation.
`docs/design/visual-reference.md` and the approved mockups agree on a teal
accent on white; the build shipped petrol and brass. The brief wins, and
re-theming is its own change — one file, because every component reads tokens
rather than hex.

Borrowing mirhaal's arrangement means borrowing its assumptions. It is a
single-application dashboard with no shared package and no second host, so the
kit/feature split here is an adaptation rather than a copy, and the places they
differ — `packages/ui` instead of `components/shared`, no database access in a
feature — are the places to be careful when lifting code across.

This ADR says nothing about which screens get built or in what order. It says
that when one is built, there is one right place for each piece of it.
