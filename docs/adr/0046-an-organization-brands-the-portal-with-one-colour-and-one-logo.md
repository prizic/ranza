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

### The colour is one hex value and the foreground is derived

Stored as lower-case `#rrggbb`, checked in the module and by a check constraint.
The foreground (white or black) is whichever has the greater WCAG contrast
against it and is never stored, so there is no pair that could disagree.

**The refusal as first specified cannot fire.** Refusing a colour where neither
white nor black reaches 4.5:1 refuses nothing: at the luminance where white and
black are equally good the contrast is 4.58:1, so every colour reaches 4.5:1
against one of them (`tests/unit/branding-module.test.ts` sweeps 4,913 colours
and shows it). The refusal is therefore the other way a brand colour is used: as
text on the white canvas, which is how links and the active navigation item draw
it. A colour under 4.5:1 against white is refused, with the contrast it reached
and the 4.5:1 it needed. The consequence is that a light brand, a yellow or a
lime, is refused though a black label on it would be readable; admitting it
needs a second, darker colour for text, which is a decision the owner has not
made (BR-S1-04).

### It reaches the Portal as two theme tokens set inline

`--primary` and `--primary-foreground`, set on the Portal shell from server data.
Primary buttons, links, the active navigation item and the brand badge all read
them already; success, warning and destructive colours are other tokens and do
not move. There is no stylesheet and no class for it, and nothing in the
Workspace sets them, which stays Ranza's. The sign-in page is outside the shell
and stays Ranza's too: the Organization is not known before the viewer is.

### The logo is Postgres bytes, validated by what they are

PNG, JPEG or WebP, at most 512 KB, at least 128 px tall and at most 4096 either
way. The type and the size are read from the bytes, never from a file name or the
type a browser sent. SVG is refused by name: it can carry script (blueprint 8).
The bytes are in a table of their own so reading the colour never reads them,
and the table repeats the signature, hash, size and dimension rules in check
constraints, with the hash generated from the bytes by the database's own
`sha256`. Object storage waits for a second kind of file (BR-DEF-06).

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
still admitted (ADR 0040).

### A Resident reads through their own policies, by Stay

A Resident reads the brand of an Organization they have a current Stay with, by
`app.resident_organization_ids()` and policies of their own, and never by a
widening of the Staff ones (ADR 0009). The Portal asks for the brand by Stay and
serves the logo by Stay, so a Resident is not told which Organization it is.
With Stays at two Organizations the header and its logo follow the Stay the page
leads with, the one that starts latest, and each Stay's section is drawn in its
own Organization's colour (BR-S1-21).

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
The tokens are set on the shell, so anything rendered outside it, as an overlay
may be, is drawn in the theme's colour; none of the Portal's overlays has been
checked for it.
