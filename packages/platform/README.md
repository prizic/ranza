# Prizic Platform Modules

Host-agnostic reusable modules. These are the **generic subdomains** — capabilities
that are not unique to hospitality and could serve a second Prizic product.

`audit/` is built. Planned: `finance/`, `inventory/`, `procurement/`,
`notifications/`, `files/`, `tasks/`, `integrations/` — each when a slice needs
it, not before (blueprint section 13).

## The rule that defines this tier

A module here **must not import or reference** `Property`, `Guest`, `Resident`,
`Stay`, `Reservation`, `AccommodationUnit`, or `Folio` (blueprint section 9.8).
Not in types, not in column names, not in comments.

Finance knows about accounts, journal entries, periods and posting requests. It
does not know what a Folio is. A host adapter in `../adapters/` performs the
translation.

This is enforced twice, because a dependency graph can only see half of it:

- `.dependency-cruiser.cjs` rejects imports from `platform/` into `ranza/`.
- `scripts/dependency-boundaries.mjs` scans source text and fails the build if
  Ranza vocabulary appears here at all.

Both have fixtures proving they fail when violated.

## The boundary change test

A normal hospitality rule change should affect a Ranza module or an adapter —
never a module in here. If it does, the boundary is leaking.

## Module anatomy

```text
<module>/
  src/
    domain/          framework-independent rules and invariants
    application/     commands, queries, use cases
    infrastructure/  Prisma repositories, external adapters
    ports.ts         what the host must supply (ADR 0006)
    index.ts         the public contract — the ONLY importable entry point
  README.md
  CHANGELOG.md
```

Importers may reach `index.ts` only. Reaching into `domain/`, `application/` or
`infrastructure/` is rejected by the boundary rules (blueprint section 9.10).

The layers are not decoration: they are what lets the boundary rules check that
a module's invariants do not reach for Prisma, which is what makes them portable
to another host. A module that has no such invariants does not need them — see
[ADR 0011](../../docs/adr/0011-module-anatomy-is-earned.md), which is also why
the Ranza tier is mostly flat.

**There is no `migrations/` directory here.** A module owns a PostgreSQL schema,
but its migration is one file in the single Prisma-owned history at
`prisma/migrations/`, named for the module that owns it and carrying its schema,
policies and grants together
([ADR 0008](../../docs/adr/0008-a-module-owns-a-schema-not-a-migration-history.md)).

## Extraction policy

Modules stay in this monorepo until a **second real product** needs one. Do not
publish to a private registry before a real consumer proves the contract is
stable (blueprint section 9.9). Premature generalisation is harder to undo than
a later extraction.

Tenancy arrives as an opaque `organization_id`. The module scopes by it without
knowing what an Organization means to the host.
