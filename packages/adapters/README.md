# Host Adapters

Thin mappings that connect Ranza concepts to generic platform module contracts.
This is where hospitality vocabulary is translated away.

Planned: `ranza-finance/`, `ranza-inventory/`, `ranza-notifications/`.

## Why this tier exists

`platform/finance` may not know what a Folio is, but closing a Folio must produce
journal entries. The adapter performs that translation:

```text
Ranza Folio closed  →  ranza-finance  →  generic PostingRequest  →  platform/finance
```

Keeping the mapping here is what lets `platform/finance` stay reusable by a
product that has no Folios at all.

## Rules

- May depend on both `platform/` and `ranza/` modules. Nothing may depend on an
  adapter — dependencies point inward, and both other tiers are forbidden from
  importing this one.
- Adapters hold mapping logic only. Business rules belong to the module that owns
  the data.
- Operational modules supply _approved_ posting events; they never write another
  module's records directly (blueprint section 5.10).
