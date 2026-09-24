import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * Nothing here is read from the environment, so this module cannot open its own
 * connection and therefore cannot choose its own database role. A departure's
 * mark is not this module's: it runs in apps/worker through one function
 * (ADR 0029), so the only client this module needs is the request one.
 */
export interface HousekeepingDeps {
  /**
   * Client for tenant-owned tables. Must be `ranza_app`: not an owner, no
   * BYPASSRLS. The write policies are the whole of what bounds a mark, and a
   * privileged role is not subject to them.
   */
  db: PrismaClient;
}
