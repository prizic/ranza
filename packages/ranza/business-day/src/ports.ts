import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * Two clients for two callers, never one for both. The module reads and closes
 * as a Staff Member, through a request context, so the policies bound it. The
 * closer runs as the worker, which holds nothing on the table and reaches it
 * only through the two functions granted to it.
 */
export interface BusinessDayDeps {
  /** `ranza_app`: not an owner, no BYPASSRLS. */
  db: PrismaClient;
}

export interface DayCloserDeps {
  /** `ranza_worker`: the worker's own role (ADR 0018), and nothing else. */
  db: PrismaClient;
}
