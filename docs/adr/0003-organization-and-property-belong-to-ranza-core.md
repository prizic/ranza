# 0003. Organization and Property belong to Ranza core, not the reusable tier

Status: Accepted
Date: 2026-09-16

## Context

The blueprint uses "platform" for two different things, and the two readings
conflict on the first tables this rebuild creates.

Section 5.1 says Platform Core "owns Organizations, Properties, users, roles,
assignments, localization, branding, Entitlements, configuration, audit
infrastructure, notifications". Section 9.8 says a reusable Prizic Platform Module
"must not import or reference `Property`, `Guest`, `Resident`, `Stay`,
`Reservation`, `AccommodationUnit`, or `Folio`", and lists Platform Modules as
finance, inventory, procurement, notifications, audit, files, tasks, integrations.

Read together, a module owning Property would be forbidden from naming Property.

## Decision

The two sections describe different tiers that share a word.

- **Ranza core** (`packages/ranza/core`) owns Organization, Property, identity,
  roles and assignments, Entitlements, and Feature Configuration. It is Ranza's own
  foundation and may use Ranza vocabulary freely. Section 5.1 describes this.
- **Reusable platform modules** (`packages/platform/*`) are host-agnostic and bound
  by the section 9.8 vocabulary prohibition. They receive tenancy context as opaque
  identifiers supplied by a host adapter.

A platform module therefore never learns what a Property is; it is told which
opaque scope a record belongs to.

## Consequences

`organization_id` and the Property identifier cross into platform modules as plain
identifiers with no Ranza semantics attached. Adapters in `packages/adapters/*`
perform the translation.

Enforcement is automated rather than trusted: `.dependency-cruiser.cjs` forbids
platform-to-ranza imports and `scripts/dependency-boundaries.mjs` fails the build if
Ranza vocabulary appears in platform module source at all.
