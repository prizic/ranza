import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * This module writes, so a privileged connection would not merely read across
 * Organizations: it would let one call another's roll and grant its students
 * leave, and the append-only triggers are the only thing it would not walk
 * through.
 */
export interface AttendanceDeps {
  /** `ranza_app`: not an owner, no BYPASSRLS. */
  db: PrismaClient;
}
