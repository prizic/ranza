import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * Nothing here is read from the environment, so this module cannot open its own
 * connection and therefore cannot choose its own database role. That has always
 * mattered; with this module it starts mattering in a second direction. Until
 * now a privileged connection would have read rows it should not have. This one
 * writes, so the same mistake would write them.
 */
export interface ReservationsDeps {
  /**
   * Client for tenant-owned tables. Must be `ranza_app`: not an owner, no
   * BYPASSRLS. The write policies are the whole of what bounds a write, and a
   * privileged role is not subject to them.
   */
  db: PrismaClient;
}
