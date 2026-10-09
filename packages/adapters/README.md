# Host Adapters

Thin mappings that connect Ranza concepts to generic platform module contracts.
This is where hospitality vocabulary is translated away.

No adapter is built. `ranza-finance/` was, and was removed with RANZ-41: a
Folio line reaches the ledger through `app.post_folio_line_to_ledger()`, a
database function that derives the entry from the Folio line itself (ADR 0042,
proposed amendment). A mapping whose input an unprivileged process could forge
belongs beside the data it reads, not in TypeScript handed a snapshot.
Planned: `ranza-inventory/`, `ranza-notifications/`.

## Why this tier exists

`platform/finance` may not know what a Folio is, but a Folio line must produce
journal entries. Something host-specific has to translate:

```text
Ranza Folio line  →  host translation  →  generic journal entry  →  platform/finance
```

Keeping the translation outside `platform/finance` is what lets that module stay
reusable by a product that has no Folios at all. When the translation can be done
in TypeScript from a source that cannot be forged, it lives here.

## Rules

- May depend on both `platform/` and `ranza/` modules. Nothing may depend on an
  adapter — dependencies point inward, and both other tiers are forbidden from
  importing this one.
- Adapters hold mapping logic only. Business rules belong to the module that owns
  the data.
- Operational modules supply _approved_ posting events; they never write another
  module's records directly (blueprint section 5.10).
