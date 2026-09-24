import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * Nothing here is read from the environment, so this module cannot open its own
 * connection and therefore cannot choose its own database role. What a returned
 * room comes back as is not this module's to write: `apps/worker` applies it
 * through one function (ADR 0032), so the only client needed is the request one.
 */
export interface MaintenanceDeps {
  /**
   * Client for tenant-owned tables. Must be `ranza_app`: not an owner, no
   * BYPASSRLS. The write policies are the whole of what bounds every command
   * here, and a privileged role is not subject to them.
   */
  db: PrismaClient;
}
