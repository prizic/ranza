import type { PrismaClient } from "@ranza/db";

/**
 * Dependencies injected into the Guest Services module (ADR 0006).
 */
export interface GuestServicesDeps {
  /**
   * Client connected as `ranza_app`.
   */
  db: PrismaClient;
}
