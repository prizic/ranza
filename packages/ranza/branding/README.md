# @ranza/branding

White-label presentation per Organization (blueprint 2 "White-label
Configuration", 3.1, 8; story 29): one brand colour and one logo, set by the
Organization and drawn by the Guest/Resident Portal.
[ADR 0046](../../../docs/adr/0046-an-organization-brands-the-portal-with-one-colour-and-one-logo.md)
says why it is this small; [`docs/features/branding/`](../../../docs/features/branding/edge-cases.csv)
says what it owes.

## What this module owns

The `organization_brands` and `organization_brand_logos` tables, their
constraints, grants and policies, and the `branding.manage` permission — in
[`20260916011100_an_organization_has_a_brand`](../../../prisma/migrations/20260916011100_an_organization_has_a_brand/migration.sql).
The logo's bytes are in a table of their own so that reading the colour never
reads them.

## Contract

```ts
import { assessBrandColor, createBrandingModule } from "@ranza/branding";

const branding = createBrandingModule({ db });

// Staff, on the runtime connection (apps/operator-workspace).
await branding.brandSettings(userId, organizationId); // { canManage, brand }
await branding.saveBrand(userId, {
  organizationId,
  primaryColor: "#0f5132", // absent: unchanged, null: back to the default
  logo: bytes, // Uint8Array; absent: unchanged, null: removed
});
await branding.resetBrand(userId, organizationId);
await branding.logoOf(userId, organizationId); // the bytes, for the preview

// A Resident, on the runtime connection (apps/guest-portal).
await branding.stayBrands(userId); // one per own current Stay, by Stay id
await branding.logoOfStay(userId, stayId);

// Pure: the verdict the screen shows while somebody is still choosing.
assessBrandColor("#ffeb3b"); // { status: "unreadable", contrast: 1.2, … }
```

## Rules

- Receives its dependencies; never reads `process.env` (ADR 0006).
- Decides nothing about who may. Whole-Organization reach, `branding.manage`
  and blueprint 3.5's gates are in the write policies (ADR 0012); a Resident
  reads through policies of their own, keyed on a current Stay (ADR 0009). A
  refusal is one error that cannot be told from there being nothing.
- The foreground is derived, never stored: white or black, whichever has the
  greater WCAG contrast against the colour. A colour under 4.5:1 against the
  Portal's white canvas is refused, because links and the active navigation
  item draw it as text there.
- A logo is PNG, JPEG or WebP, at most 512 KB, at least 128 px tall and at most
  4096 either way. The type and the size are read from the bytes. SVG is
  refused by name: it can carry script (blueprint 8). The database repeats the
  signature, hash, size and dimension rules in constraints.
- Nothing is deleted. A reset empties the colour and the logo; every change and
  every reset is audited with the old and new colour, and the logo as a hash and
  a size, never its bytes.
