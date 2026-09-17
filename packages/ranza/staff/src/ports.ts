import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * One client, and deliberately no second one. Ending a session means reaching
 * `auth_session`, which `ranza_app` is granted nothing on and `ranza_auth`
 * exists for (ADR 0005) — a `credentials` client here would be the moment that
 * boundary stopped meaning anything. This module publishes `staff.reach_changed`
 * inside the transaction that changed the reach instead, and slice 4's handler
 * is what crosses over (SP-S4-01, ADR 0017).
 */
export interface StaffDeps {
  /**
   * Client for tenant-owned tables. Must be `ranza_app`: not an owner, no
   * BYPASSRLS. Every rule in this module is a policy, a grant or a trigger, and
   * a privileged role is subject to none of them.
   */
  db: PrismaClient;
}
