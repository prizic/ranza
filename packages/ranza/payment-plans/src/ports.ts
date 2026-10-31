import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * Two clients for two callers, never one for both. The module makes and reads
 * plans as a Staff Member, through a request context, so the policies bound
 * it. The poster runs as the worker, which holds nothing on either table and
 * reaches them only through the two functions granted to it.
 */
export interface PaymentPlansDeps {
  /** `ranza_app`: not an owner, no BYPASSRLS. */
  db: PrismaClient;
}

export interface InstalmentPosterDeps {
  /** `ranza_worker`: the worker's own role (ADR 0018), and nothing else. */
  db: PrismaClient;
}
