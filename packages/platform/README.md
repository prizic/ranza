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
    index.ts         the public contract — the ONLY importable entry point
  migrations/        schema, RLS policies, grants
  tests/
```

Importers may reach `index.ts` only. Reaching into `domain/`, `application/` or
`infrastructure/` is rejected by the boundary rules (blueprint section 9.10).

## Extraction policy

Modules stay in this monorepo until a **second real product** needs one. Do not
publish to a private registry before a real consumer proves the contract is
stable (blueprint section 9.9). Premature generalisation is harder to undo than
a later extraction.

Tenancy arrives as an opaque `organization_id`. The module scopes by it without
knowing what an Organization means to the host.
