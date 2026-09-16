# 0023. Copy is ICU through next-intl, and the catalogue stays typed

Status: Accepted
Date: 2026-09-16

## Context

Ranza launches in Turkish, English and Arabic with full RTL (blueprint 12), and
those are designed with a feature rather than retrofitted. Until now there was
no i18n runtime at all. `@ranza/i18n` held the locale union, `directionFor`, and
`Intl` wrappers; each application held a hand-written
`Record<SupportedLocale, Messages>` and every server component resolved
`messages[locale]` and passed the whole catalogue to every client component as a
`copy` prop.

That bought one thing no library offers: a missing Arabic string is a **compile
error**. The label maps are keyed on domain unions — `Record<OwnStay["status"],
string>` — so adding a Stay status to `@ranza/stays` fails the build until all
three languages have a word for it. Blueprint 12 says user-entered content stays
distinguishable from translated system text and there is no fallback locale;
that guarantee was the type system's, not a convention's.

It also could not express a plural. `packages/…/lib/table-labels.ts` did
`template.replace("{n}", String(n))`, which meant:

- English rendered **"1 results"** whenever a table held one row.
- Arabic agrees with the number in six categories — zero, one, two, few, many,
  other — collapsed into one form with a digit spliced in.
- The number bypassed `formatNumber`, so no group separator and no locale
  numeral system.

A hole in a string cannot be taught grammar, whatever is substituted into it.

## Decision

Adopt **next-intl** for message resolution and formatting, and **keep the
catalogues as typed TypeScript** rather than moving them to JSON.

`getRequestConfig` in each application returns `messages[locale]` from the
existing record, and an `AppConfig` module augmentation points `Messages` at the
`Messages` **interface**, not at one locale's object. So:

- Every locale is still checked against the same shape. A key only Turkish has
  is a type error, and so is `t("noArrivalsTitl")`.
- Counted strings become ICU, which is the thing the old spelling could not do.
- `NextIntlClientProvider` in the root layout replaces the `copy` prop that was
  threaded through nineteen client components.

Functions that read copy and are called from client components become hooks —
`useTableLabels`, `useWorkspaceNav`, `useArrivalColumns` — rather than taking a
translator as a parameter, because a translator type threaded through four
layers is worse than a hook in a component that already renders.

`packages/i18n` keeps `formatMoney`: integer minor units read from the resolved
currency is this product's rule (ADR 0015), not a formatter's.

## Consequences

next-intl is well maintained — 248 releases, weekly cadence, MIT, and a peer
range covering the Next 16 and React 19 this repository runs — so the usual risk
of a translation library going quiet is low, and it is checked before it matters
rather than after.

**A non-developer still cannot translate Ranza.** That is the cost of keeping
the catalogues in TypeScript, and it was chosen deliberately: today the people
writing the copy are the people writing the code, and losing the compile-time
guarantee to gain a workflow nobody uses yet would be paying now for later. When
a translator or a TMS arrives, the move is JSON catalogues plus a script in
`pnpm check` that fails when the three key sets diverge — which is the compiler's
job done less well, and should not be taken on before it buys something.

ICU fails when a string is **formatted**, not when it is written: an unbalanced
brace typechecks, builds, and throws on the one screen that renders it. So
`tests/unit/messages-icu.test.ts` formats every string in every language, and
asserts the plural boundaries directly. Reverting one plural to its old form
turns three of those tests red.

Locale negotiation was **not** adopted. next-intl ships middleware that reads
`Accept-Language` and redirects `/`; the applications already resolve the locale
from the `[locale]` segment and redirect the root in `next.config.ts`, and
replacing something that works with something larger is not what this change is
for.
