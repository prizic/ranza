# 0002. Drop Supabase; PostgreSQL is the only backend dependency

Status: Accepted
Date: 2026-09-16
Supersedes: the original 0002, which specified separate Supabase projects.

## Context

The pilot used Supabase for PostgreSQL, authentication, and local tooling. The
rebuild should not depend on a single vendor for the data platform, and Prisma
owning migrations conflicts with Supabase owning them too.

The coupling turned out to be three lines: two `references auth.users (id)`
foreign keys and one test fixture. Policies never called `auth.uid()` or
`auth.jwt()` — they read `app.current_user_id()` from a transaction-local
setting, chosen for Prisma's pooled connection but incidentally provider
agnostic. The entire authorization layer survives the removal unchanged.

## Decision

Ranza depends on PostgreSQL and nothing else for its data platform. Supabase is
removed: no `supabase/` directory, CLI, or hosted project.

Local development runs plain PostgreSQL in Docker. Development, staging, and
production remain separate databases as blueprint section 9.4 requires. Every
Organization shares the database for its environment; isolation is a policy
concern, not an infrastructure one.

Production hosting is deliberately undecided. Nothing may depend on a
provider-specific extension or API, so the choice stays reversible.

## Consequences

Authentication is no longer supplied — see ADR 0005.

pgTAP remains, since it is an ordinary PostgreSQL extension rather than a
Supabase feature.

Connection pooling differs between candidate hosts and may need revisiting once
production hosting is chosen. The runtime role must stay RLS-subject on any host.
