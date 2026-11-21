import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide (ADR 0006).
 *
 * `ranza_app`: not an owner, no BYPASSRLS. The module records what a file held
 * and what became of each row; a privileged connection would let one person
 * read another's rows, which in slice 2 hold identity numbers.
 */
export interface ImportsDeps {
  db: PrismaClient;
}

/** `ranza_worker`, which reaches imports through two functions and no table. */
export interface ImportSweeperDeps {
  db: PrismaClient;
}
