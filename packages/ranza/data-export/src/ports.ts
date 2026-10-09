import type { PrismaClient } from "@ranza/db";

export interface DataExportDeps {
  readonly db: PrismaClient;
}

/**
 * What a worker transaction uses: raw queries and the one statement that sets
 * its context. Narrower than the driver's client so a reader of this module can
 * see that it has no other way into the database.
 */
export interface ExportClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}
