import type { PrismaClient } from "@ranza/db";

export interface DataExportDeps {
  readonly db: PrismaClient;
}
