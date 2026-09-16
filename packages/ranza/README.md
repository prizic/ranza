# Ranza Domain Modules

The **core domain** — what makes Ranza specifically a hospitality product. These
modules may use hospitality vocabulary freely.

Planned: `core/`, `accommodation/`, `reservations/`, `stays/`, `housekeeping/`,
`guest-services/`, `folios/`, `food-and-beverage/`.

`core/` owns Organization, Property, identity, roles and assignments,
Entitlements and Feature Configuration. It lives here rather than in `platform/`
because Organization and Property are Ranza concepts — see
[ADR 0003](../../docs/adr/0003-organization-and-property-belong-to-ranza-core.md),
which resolves the blueprint's own section 5.1 / 9.8 ambiguity about who may own
`Property`.

## Rules

- May depend on `platform/` modules and cross-cutting infrastructure.
- Must **not** depend on `adapters/` — adapters sit above domain modules.
- Each module owns its tables. No other module writes to them; cross-module work
  goes through contracts, commands or events (blueprint section 6).
- Only `index.ts` is importable.

Student residence is **not** a module here. It is a Property configuration — see
[ADR 0004](../../docs/adr/0004-student-residence-is-a-property-configuration.md).
