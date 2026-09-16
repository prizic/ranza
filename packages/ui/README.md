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
  components/ui/      shadcn components — owned source, edit them freely
  components/         app-shell, patterns, empty-state, brand-mark
  lib/utils.ts        cn()
  styles/globals.css  the theme, exported as @ranza/ui/globals.css
```

## Adding a shadcn component

```sh
cd packages/ui && npx shadcn@latest add <name>
```

Two things need fixing afterwards, every time:

1. The CLI writes `import { cn } from "cn"` — a third-party package, not this
   one. Change it to `../../lib/utils`. A `@/lib/utils` alias would not do:
   each application compiles this package's source with its own path
   resolution, and the alias is not defined there.
2. Run `npx shadcn@latest migrate rtl` so directional classes become logical
   ones. The CLI does not do this on `add`.

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
