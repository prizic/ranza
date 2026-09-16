import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * One client, and it must be `ranza_app`: not an owner, no BYPASSRLS. That has
 * mattered since the first module; it matters most here. The policies and the
 * append-only trigger are the whole of what bounds a financial record, and a
 * privileged connection is subject to neither — it would keep working while
 * every guarantee in the migration quietly stopped applying.
 */
export interface FoliosDeps {
  db: PrismaClient;
}
