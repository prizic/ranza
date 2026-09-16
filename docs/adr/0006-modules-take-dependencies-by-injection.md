# 0006. Modules take dependencies by injection

Status: Accepted
Date: 2026-09-16

## Context

`packages/db` and `packages/auth` each constructed their own Prisma client from
`process.env` and exported a module-level singleton.

That reads as convenient and is not. A module which discovers its own
configuration is welded to one process: it cannot be pointed at a throwaway
database, cannot be reused by a second host, and silently couples every consumer
to whichever connection the singleton happened to open first. Blueprint section
9.10 requires a module to own its rules and expose a small contract; a module
that reaches into the environment has an invisible dependency outside that
contract.

The cost of fixing this grows with every module added, and the repository
currently has few.

## Decision

No package under `packages/` reads `process.env` or constructs its own database
connection. `packages/config` is the sole exception, because parsing the
environment is its entire purpose.

A module exposes a `ports.ts` declaring what the host must supply, and a
`create<Name>Module(deps)` factory as its front door. `packages/auth/src/ports.ts`
is the reference: a client, a secret, an optional base URL, and an overridable
clock.

The host composes connections and passes them in. Because the tenant query path,
the migration path and the credential path use different database roles, the host
holds several clients — and that is the point. A module which cannot choose its
own connection cannot accidentally use the wrong role.

## Consequences

Tests compose exactly what an application will compose, so the wiring is proven
before any application exists.

Extraction later is a move, not a rewrite. Blueprint section 9.9 defers
publishing a module until a second product needs it; this keeps that option cheap
without paying for it now.

Enforced by `scripts/dependency-boundaries.mjs`, which fails the build if a
module references `process.env`, and is itself verified by sabotage. Discipline
alone would not survive deadline pressure.

The convenience of importing a ready-made client is gone. Hosts must construct
and dispose of clients, including connection reuse across hot reloads, which is
an application concern rather than a module one.
