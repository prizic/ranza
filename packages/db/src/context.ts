/**
 * Tenant request context for pooled connections.
 *
 * ADR 0001: Prisma issues queries under a role that RLS still applies to, so
 * every tenant-scoped query must publish the acting user inside the same
 * transaction that runs it. app.set_request_context() sets a transaction-local
 * setting, which a pooled connection cannot leak into the next request.
 *
 * Reaching a tenant-owned table outside this helper is a bug: RLS then sees a
 * null acting user and denies, which fails safe but looks like missing data.
 */

export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantContextError";
  }
}

export interface RequestContext {
  userId: string;
}

/** The transaction-scoped surface a tenant query may use. */
export interface TenantClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/**
 * The isolation levels a tenant read may ask for. Absent means the database
 * default, READ COMMITTED, where every statement sees its own snapshot.
 */
export type TenantIsolationLevel = "RepeatableRead";

export interface TenantTransactionOptions {
  /**
   * RepeatableRead gives every statement in the transaction one snapshot, for
   * a read made of several queries that must agree with each other. It is set
   * when the transaction begins, so it applies from the context statement on.
   */
  isolationLevel?: TenantIsolationLevel;
}

interface TransactionOptions extends TenantTransactionOptions {
  maxWait?: number;
  timeout?: number;
}

interface TransactionCapable<TClient extends TenantClient> {
  $transaction<TResult>(
    run: (client: TClient) => Promise<TResult>,
    options?: TransactionOptions,
  ): Promise<TResult>;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Runs `query` in a transaction that has the acting user published to Postgres.
 *
 * The user id is validated before it reaches the database. It is also passed as
 * a bound parameter rather than interpolated, so neither layer can be used to
 * inject SQL.
 */
export async function withOrganizationContext<
  TClient extends TenantClient,
  TResult,
>(
  prisma: TransactionCapable<TClient>,
  context: RequestContext,
  query: (client: TClient) => Promise<TResult>,
  options: TenantTransactionOptions = {},
): Promise<TResult> {
  if (!UUID.test(context.userId)) {
    throw new TenantContextError("request context requires a valid user id");
  }

  return prisma.$transaction(
    async (client) => {
      await client.$executeRawUnsafe(
        "select app.set_request_context($1::uuid)",
        context.userId,
      );
      return query(client);
    },
    { maxWait: 15_000, timeout: 30_000, ...options },
  );
}
