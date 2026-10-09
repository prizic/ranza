import type { TenantClient } from "@ranza/db";

/**
 * What the host must supply to the finance module (ADR 0006).
 *
 * Like audit and outbox, this module takes its database connection from the host
 * rather than discovering or constructing one.
 */
export interface FinanceDeps {
  readonly db: TenantClient;
}

/** The transaction client surface this module requires: reads only. */
export interface FinanceClient extends TenantClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}
