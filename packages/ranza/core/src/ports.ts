import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * Nothing here is read from the environment. The module cannot open its own
 * connection, so it cannot choose its own database role — which is the point:
 * the host hands it the RLS-subject tenant client and no other.
 */
export interface CoreDeps {
  /**
   * Client for tenant-owned tables. Must be connected as `ranza_app`: not an
   * owner, no BYPASSRLS. A privileged connection here would make every policy
   * in this module's queries silently stop applying.
   */
  db: PrismaClient;
}
