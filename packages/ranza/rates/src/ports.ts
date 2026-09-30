import type { PrismaClient } from "@ranza/db";

/** What the host must provide (ADR 0006). */
export interface RatesDeps {
  /** `ranza_app`: not an owner, no BYPASSRLS. */
  db: PrismaClient;
}
