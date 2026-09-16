# @ranza/ui

The shared interface layer: shadcn/ui components, the Ranza patterns that repeat
across applications, and the one place the design tokens live.

## Rules

- **No hand-written CSS.** Styling is Tailwind utilities in the component that
  uses them. The only stylesheet in the repository is
  [`src/styles/globals.css`](src/styles/globals.css), which holds the theme and
  a short `@layer base` — not component rules.
- **Every directional utility is a logical one.** `ps`/`pe` not `pl`/`pr`,
  `border-s` not `border-l`, `text-start` not `text-left`. Arabic then mirrors
  by construction rather than through a second stylesheet, which is what
  blueprint section 9.5 asks for and what a retrofit never quite achieves.
- **No server code.** This package must not import a database client, `@ranza/config`
  or anything server-only — a rule `.dependency-cruiser.cjs` enforces.
  `next` is a peer dependency: the rail reads the pathname to mark the current
  destination, which is a client hook and the only way that question has an
  answer. An earlier version of this file claimed the package was
  framework-free and routed around it with a slot; the rail is worth the peer.

## Layout

```text
src/
  components/ui/          shadcn components — owned source, edit them freely
  components/data-table/  the listing kit, ported from ryadh/mirhaal
  components/app-rail.tsx the 76px rail and the mobile dock, also ported
  components/             app-shell, patterns, kpi-card, status-badge, ...
  lib/utils.ts            cn()
  lib/menu-guard.ts       the overlay-click guard the primitives arm
  lib/search.ts           free-text matching across scripts and digit forms
  styles/globals.css      the theme, exported as @ranza/ui/globals.css
```

## The shell

`AppShell` is a frame with slots: a 76px rail down the start edge, a page bar
across the top of what is left, and the work surface under it. On a phone the
rail is replaced by a dock at the foot.

The rail **does not collapse** — a rail that changes width is a control the
reader has to manage — and groups open as two sliding levels rather than an
accordion, so the tiles stay where the eye left them. `AppPageBar` is both the
top bar and the page's `h1`: a chrome row and a title row underneath it were two
bands saying one thing. A page therefore renders no `h1` of its own.

A route with no entry in the host's page-titles list renders **no bar at all**,
silently. That is how a whole screen shipped without a heading in the dashboard
this came from; it is worth knowing about rather than guarding against here.

## The listing kit

`DataTable` is one shell for every listing: sorting, faceted filters, free-text
search, column visibility, selection and pagination. A screen supplies columns
and facets and nothing else. It is carried across from
`ryadh/mirhaal/apps/dashboard` rather than reimplemented — see
[ADR 0013](../../docs/adr/0013-an-interface-is-shadcn-a-feature-folder-and-a-shared-kit.md)
for why, and for the two things that changed on the way.

**`markOverlayClosed` is armed inside the primitives**, not at call sites.
`Popover`, `Dialog`, `Sheet`, `DropdownMenu` and `Select` each call it when they
close, because dismissing an overlay is a pointerdown while it is open and a
pointerup after it has gone — so the click lands on whatever is underneath,
which on a listing is a table row. An overlay added later must do the same, or
closing it will open a row.

## Adding a shadcn component

```sh
cd packages/ui && npx shadcn@latest add <name>
```

The style is `radix-luma`: Radix primitives, luma's shapes and states. It came
from the `b1VlIttI` preset, whose **palette was deliberately not taken** — that
preset is greyscale, and the colours here are the brief's.

Two things need fixing afterwards, every time:

1. The CLI writes `import { cn } from "cn"` — a third-party package, not this
   one. Change it to `../../lib/utils`. A `@/lib/utils` alias would not do:
   each application compiles this package's source with its own path
   resolution, and the alias is not defined there.
2. If the component is an overlay, arm the menu guard in its root — see the
   listing kit above.

`migrate rtl` is **no longer** part of this. `components.json` carries
`"rtl": true`, so `add` emits logical properties itself — a fresh `table` comes
out with `text-start` and `pe-0` already. That also removes the trap where
running `migrate rtl` over `sidebar.tsx` rewrote its physical `side` positioning
and put the rail on the wrong edge in Arabic.

Then export it from [`src/index.ts`](src/index.ts) — applications import from
the package root and never reach into `src/`.

## Tokens

The palette is petrol chrome, a paper work surface, and brass on exactly one
thing: the slot you are currently in. shadcn's vocabulary (`background`,
`foreground`, `muted`, `border`, `ring`) is mapped onto it so its components and
ours read from one system, and a few Ranza-specific names (`petrol`, `brass`,
`ink-soft`) exist because that vocabulary has no word for "the petrol bar".

[`docs/design/visual-reference.md`](../../docs/design/visual-reference.md)
records a **different** intended direction — teal, Aptos, softer radii — that
this implementation has not adopted. That gap is deliberate and open; see the
note in that file.
