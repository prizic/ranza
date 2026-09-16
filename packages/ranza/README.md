# Ranza Domain Modules

The **core domain** — what makes Ranza specifically a hospitality product. These
modules may use hospitality vocabulary freely.

Built: `core/`, `accommodation/`, `stays/`.
Planned: `reservations/`, `housekeeping/`, `guest-services/`, `folios/`,
`food-and-beverage/`.

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
- Each module carries a `README.md` and a `CHANGELOG.md`; `pnpm check` fails
  without them.

## Shape

Flat — `contracts.ts`, `ports.ts`, `module.ts`, `index.ts` — not the layered
`domain/` / `application/` / `infrastructure/` anatomy the platform tier uses.

That is deliberate and it is where this product keeps its invariants. A Unit
cannot belong to another Organization's Property because of a composite foreign
key; a Resident reaches only their own Stay because of a policy. Restating those
rules in a TypeScript `domain/` layer would be a second, weaker copy that an
application defect could skip, and row-level security is meant to be the
boundary rather than a backstop (blueprint 7.1).

A module here earns the layers when it gains a rule the database genuinely
cannot hold — a rate calculation, a cancellation policy. See
[ADR 0011](../../docs/adr/0011-module-anatomy-is-earned.md).

Student residence is **not** a module here. It is a Property configuration — see
[ADR 0004](../../docs/adr/0004-student-residence-is-a-property-configuration.md).
