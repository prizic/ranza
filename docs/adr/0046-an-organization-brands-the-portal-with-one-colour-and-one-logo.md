# 0046. An Organization brands the Portal with one colour and one logo

Date: 2026-10-11

Status: Proposed

Builds on [ADR 0009](0009-a-resident-reaches-their-own-stay-not-an-organization.md),
[ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md),
[ADR 0026](0026-a-role-is-a-named-set-of-permissions-and-reach-is-taken-away-for-free.md),
[ADR 0031](0031-an-audit-record-carries-its-location-and-is-read-by-permission.md) and
[ADR 0040](0040-what-admits-a-subscription-status-and-an-active-property.md).

## Context

Blueprint 2 lists white-label configuration as brand name, logo, colours,
typography, domains, email identity and approved terminology, and story 29 asks
for "supported branding controls so that Ranza matches the Organization without
creating a fork". Blueprint 8 says what it must not do: change security rules,
bypass Entitlements, create customer-specific schemas or code branches, allow
arbitrary executable code, or redefine financial or audit semantics. Nothing
was built: every Portal looked like Ranza's.

The smallest piece that reaches a person is the colour and the logo of the
Portal a Guest actually opens. The user settled the shape of it on 2026-10-11
(RANZ-47); these are decisions the code now assumes, and the owner has not made
them.

## Decision

### One colour and one logo, per Organization

Custom domains, typography, email identity, terminology mappings, a brand per
Property and the brand name are deferred (BR-DEF-01 to 07). The brand is the
Organization's, because it is how the Organization presents itself and not how
one of its buildings does.

### The colour is one hex value, and what it is drawn as is derived

Stored as lower-case `#rrggbb`, checked in the module and by a check constraint.
Every valid colour is accepted: refusing one would reject most real hotel brands.
Two things are derived from it where it is read, and neither is stored, so
there is no set of values that could disagree:

- **The foreground** of a button or filled surface: white or black, whichever has
  the greater WCAG contrast against the colour. One of the two always reaches
  4.5:1 (at the luminance where they are equally good the contrast is 4.58:1;
  `tests/unit/branding-module.test.ts` sweeps 4,913 colours and shows it).
- **The text shade**, for links, text and focus rings on the white canvas: the
  colour itself where it already reaches 4.5:1 against white, otherwise the same
  hue at the greatest OKLCH lightness that does, with chroma giving way where the
  sRGB gamut requires it. An orange makes a fine button and a poor link; its text
  shade is a darker orange. The sweep asserts every colour has one at 4.5:1 or
  better, that it is darker, and that its hue is the colour's to within 4 degrees.

The refusal first specified (a colour where neither white nor black reaches
4.5:1) could never fire, and a second version (refuse a colour under 4.5:1 against
white) refused most real brands; both are replaced by this (BR-S1-04). The cost is
a second token, below, and the Branding screen shows both swatches and says the
darker one is used for text.

### It reaches the Portal as theme tokens set inline

`--primary` and `--primary-foreground` for fills, and `--primary-text` and
`--ring` for text, links and outlines, set on the Portal shell from server data.
`--primary-text` is a token this adds to the theme, defaulting to `--primary`; the
shared components that drew text with `text-primary` (the link variants of the
button and the badge, the rail's group label, the planned screen's link, the date
pickers) now use `text-primary-text`, which changes nothing where no brand is set.
Primary buttons and the active navigation item and brand badge read
`--primary`; success, warning and destructive colours are other tokens and do
not move. There is no stylesheet and no class for it, and nothing in the
Workspace sets them, which stays Ranza's. The sign-in page is outside the shell
and stays Ranza's too: the Organization is not known before the viewer is.

### The logo is Postgres bytes, validated by what they are

PNG, JPEG or WebP, at most 512 KB, at least 128 px tall and at most 4096 either
way. The type and the size are read from the bytes, never from a file name or the
type a browser sent, and a file that is cut short or added to is refused: every
PNG chunk's length and checksum, the IEND that ends it with nothing after; a
WebP's declared length against its size; a JPEG's start and end markers. SVG is refused by name: it can carry script (blueprint 8).
The bytes are in a table of their own so reading the colour never reads them,
and the table repeats the signature, hash, size and dimension rules in check
constraints, with the hash generated from the bytes by the database's own
`sha256`. Object storage waits for a second kind of file (BR-DEF-06).

A server action's body is 1 MB by default, so a logo of 600 KB or 2 MB would be
refused by the framework before the module could say why. The Workspace sets the
limit to 4 MB and the module's refusal, `too_large`, reaches the screen (BR-S1-42);
the screen carries no copy of the 512 KB rule.

It is served by each application's own route, versioned by its hash
(`?v=<hash>`, cacheable for good) and revalidated by ETag, `private` because the
route answers only to a signed-in viewer. A changed logo is a new URL, which is
why it shows on the next page load.

### `branding.manage`, across the whole Organization, behind every gate

A permission of its own in the catalogue under `platform_core`, held by the
shipped Owner. Both tables' insert and update policies carry membership,
whole-Organization reach (a brand has no Property to narrow to), the permission,
the Subscription, Entitlement and Property-capability gates of blueprint 3.5 at
the Configuration capability, and the author named. A past-due Subscription is
still admitted (ADR 0040). The Branding rail entry and page ask the same gates:
the Workspace lists a Property for the screen only where the permission and the
Configuration capability both hold there, so a lapsed Subscription, a revoked
Entitlement or Configuration switched off removes the entry and the page says
what every unreachable screen says. Only a holder who passes every gate and lacks
reach is told the brand is the whole Organization's (BR-S1-30, BR-S1-38).

### A Resident reads through their own policies, by Stay

A Resident reads the brand of an Organization they have a current Stay with, by
`app.resident_organization_ids()` and policies of their own, and never by a
widening of the Staff ones (ADR 0009). The Portal asks for the brand by Stay and
serves the logo by Stay, so a Resident is not told which Organization it is.

The Resident policies, and the Stay-keyed reads beside them, ask what the Stay
list asks of every Stay it shows: `app.resident_can_use_capability()`, which is
the Subscription (a past-due one is a grace period, ADR 0040), the Front Office
Entitlement and the Property's `portal_stay_overview` capability. A Resident who
is shown no Stay is handed no brand and no logo, and the logo route answers 404.
The Resident and Staff read through the same database role, so the role's SELECT
grants name the columns either screen draws and no others: who wrote a brand and
when are neither the Portal's to read nor the Workspace's.
With Stays at two Organizations the header and its logo follow the Stay the page
leads with, the one that starts latest, and each Stay's section is drawn in its
own Organization's colour (BR-S1-21).

A brand that cannot be read is reported and answered with the default theme, in
the layout and on the Stay page alike: the colour is decoration and the Stay is
what the Portal is for, and a failed read of the first must not be the failure of
the second (BR-S1-37). The report is a `console.error`, which is this
application's only reporter so far.

### Nothing is deleted, and every change is audited

A reset empties the colour and the logo in place; `ranza_app` holds no `DELETE`
on either table, as it holds none anywhere. Every change and every reset records
`branding.changed` or `branding.reset` with the colour before and after and the
logo as a content hash and a size, never the bytes. A save that changes nothing
records nothing. Two changes at once are serialised by an advisory lock, so each
record's old value is what that change replaced.

## Consequences

An Owner who is also staying at their own Organization reads the brand as a
Resident does and is still refused every write the policies refuse; that is the
case that tells a write policy's own clauses from the read policy beneath them
(`tests/database/branding.test.sql`).

A Staff Member who holds `branding.manage` at one Property only is told the brand
is the whole Organization's rather than shown a form whose every save would be
refused (BR-S1-30).

The logo's alt text is the Property's name until a brand name exists (BR-DEF-07).
The tokens are set on the shell, so an overlay rendered outside it is drawn in
the theme's colour. The Portal's only overlays, the account menu and the
language switcher, read no `primary` token (checked by grep), so none shows the
difference today; a later overlay that does would have to carry the tokens
itself.
