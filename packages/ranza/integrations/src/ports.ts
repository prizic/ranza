import type { PrismaClient } from "@ranza/db";

export interface IntegrationsDeps {
  readonly db: PrismaClient;
}
