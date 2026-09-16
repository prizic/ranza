# 0001. Prisma for queries, explicit SQL for row-level security

Status: Accepted
Date: 2026-09-16

## Context

Blueprint section 9.13 permits Prisma for server-side data access but requires
Row-Level Security policies to remain explicit, module-owned SQL, and requires the
runtime database role to stay subject to tenant isolation. It deliberately leaves
the choice open.

The archived pilot used Supabase and hand-written SQL with no query layer. That was
workable for five workflows but does not scale to the module count and reporting
joins this blueprint describes.

## Decision

Prisma provides type-safe server-side queries. RLS policies, security-definer
functions, and grants stay in explicit SQL migrations owned by the module that owns
the tables. Prisma never generates or manages a policy.

The runtime connection uses a role that RLS applies to. Because Prisma pools
connections under a single role, every request must propagate its user context
inside the transaction that runs the query — `set_config('request.jwt.claims', ...)`
or equivalent — so policies evaluate against the acting user rather than the pool
identity. Migrations and administrative work use a separate direct connection whose
role is never used for ordinary runtime queries.

## Consequences

Per-transaction context propagation is the load-bearing risk in this decision. If
it leaks or is forgotten on any path, tenant isolation silently degrades to
application-layer checks only. The walking skeleton therefore proves this mechanism
with a cross-Organization denial test before any feature work depends on it.

Any query path that cannot propagate context must not reach tenant-owned tables.
