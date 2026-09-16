# 0002. Separate Supabase projects per environment

Status: Accepted
Date: 2026-09-16

## Context

Blueprint section 9.4 requires development, staging, and production to use separate
backend environments, and section 14 lists sharing one backend instance across
environments as an explicit non-goal.

The archived pilot shared one Supabase project across customers within an
environment, which remains correct — tenant isolation is enforced by RLS, not by
infrastructure separation.

## Decision

Three Supabase projects: development, staging, and production. Every Organization
shares the project for its environment; isolation is a database policy concern.

## Consequences

Migrations run forward through all three. Environment-specific configuration must
never be hard-coded, and no production credential may appear in a development or CI
environment.
