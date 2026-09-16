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
- **Framework-free.** This package has React as its only peer dependency and
  must not import a router, a database client or anything server-only — a rule
  `.dependency-cruiser.cjs` enforces. It is why `AppShell` takes a
  `navigationSlot` instead of reading the pathname itself.

## Layout

```text
src/
  components/ui/          shadcn components — owned source, edit them freely
  components/data-table/  the listing kit, ported from ryadh/mirhaal
  components/             app-shell, patterns, kpi-card, status-badge, ...
  lib/utils.ts            cn()
  lib/menu-guard.ts       the overlay-click guard the primitives arm
  lib/search.ts           free-text matching across scripts and digit forms
  styles/globals.css      the theme, exported as @ranza/ui/globals.css
```

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

Three things need fixing afterwards, every time:

1. The CLI writes `import { cn } from "cn"` — a third-party package, not this
   one. Change it to `../../lib/utils`. A `@/lib/utils` alias would not do:
   each application compiles this package's source with its own path
   resolution, and the alias is not defined there.
2. Run `npx shadcn@latest migrate rtl` so directional classes become logical
   ones. The CLI does not do this on `add` — and **it gets `sidebar.tsx`
   wrong**: it rewrites the `side`-keyed `left-0`/`right-0` to `start-0`/`end-0`,
   which double-flips in Arabic and puts a `side="right"` rail on the left.
   `side` is a physical edge in shadcn's API, so what positions it stays
   physical. Re-check that file after every run.
3. If the component is an overlay, arm the menu guard in its root — see the
   listing kit above.

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
