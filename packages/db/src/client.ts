import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Creates a database client for a given connection.
 *
 * This package deliberately reads no environment variables and holds no
 * singleton. The host composes its clients and passes them to modules, which is
 * what keeps a module portable: it cannot accidentally depend on one process's
 * configuration.
 *
 * Callers are responsible for pointing this at the right role. The runtime
 * connection must be RLS-subject — never a table owner or a BYPASSRLS role, or
 * every policy silently stops applying. Migrations use a separate direct
 * connection because a transaction-mode pooler cannot run DDL (ADR 0001).
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export type { PrismaClient };
