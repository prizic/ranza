import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * Nothing here is read from the environment, so this module cannot open its own
 * connection and therefore cannot choose its own database role. That matters
 * more here than elsewhere: the Resident policies are the only thing standing
 * between one Resident and another, and a privileged connection would switch
 * all of them off while every query still appeared to work.
 */
export interface StaysDeps {
  /** Client for tenant-owned tables. Must be `ranza_app`: no owner, no BYPASSRLS. */
  db: PrismaClient;
}
