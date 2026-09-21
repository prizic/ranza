import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * Nothing here is read from the environment, so this module cannot open its own
 * connection and therefore cannot choose its own database role. This module
 * writes, so a privileged connection would not merely read across
 * Organizations: it would let one add rooms to another's Property.
 */
export interface AccommodationDeps {
  /**
   * Client for tenant-owned tables. Must be `ranza_app`: not an owner, no
   * BYPASSRLS. The write policies are the whole of what bounds a write, and a
   * privileged role is not subject to them.
   */
  db: PrismaClient;
}
