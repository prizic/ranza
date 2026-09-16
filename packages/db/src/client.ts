import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Runtime client.
 *
 * Connects through DATABASE_URL, which must point at a pooled connection in
 * production. Migrations use DIRECT_URL via prisma.config.ts — a transaction
 * mode pooler cannot run DDL (ADR 0001).
 *
 * The role behind DATABASE_URL must be RLS-subject. Never point it at an owner
 * or a BYPASSRLS role: every policy would silently stop applying.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  return createPrismaClient(connectionString);
}

// Reused across hot reloads in development, where a new client per reload
// exhausts the connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
