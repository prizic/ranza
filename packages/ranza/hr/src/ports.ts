import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * Nothing here is read from the environment, so this module cannot open its own
 * connection and therefore cannot choose its own database role.
 */
export interface HrDeps {
  /**
   * Client for tenant-owned tables. Must be `ranza_app`: not an owner, no
   * BYPASSRLS. The policies are the whole of what bounds every command here,
   * and a privileged role is not subject to them.
   */
  readonly db: PrismaClient;
}

/** A transaction that already carries the acting user's request context. */
export type HrTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;
