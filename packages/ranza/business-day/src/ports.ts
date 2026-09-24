import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * The module reads and closes as a Staff Member, through a request context, so
 * the policies bound it.
 */
export interface BusinessDayDeps {
  /** `ranza_app`: not an owner, no BYPASSRLS. */
  db: PrismaClient;
}
