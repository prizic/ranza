import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * One client, and it must be the RLS-subject runtime role. This module has no
 * privileged path by construction: it cannot read a scope the acting user
 * cannot reach, and it cannot write one either.
 */
export interface AuditDeps {
  db: PrismaClient;
}
