import type { PrismaClient } from "@ranza/db";

export interface HrDeps {
  readonly db: PrismaClient;
}
