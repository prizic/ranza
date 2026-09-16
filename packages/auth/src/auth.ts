import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { PrismaClient } from "@ranza/db";
import { createPrismaClient } from "@ranza/db";

/**
 * Authentication only. Better Auth owns sessions, credentials and MFA.
 *
 * It does not own authorization. Roles, Property assignments, Entitlements and
 * tenant isolation belong to Ranza and Postgres (ADR 0005). Nothing here decides
 * what a Staff Member may do.
 *
 * It connects as ranza_auth rather than ranza_app. The credential tables hold
 * password hashes and session tokens, and the tenant query path is granted
 * nothing on them, so a defect there cannot read them.
 */
function authDatabaseUrl(): string {
  const url = process.env.AUTH_DATABASE_URL;
  if (!url) throw new Error("AUTH_DATABASE_URL is required");
  return url;
}

// Annotated explicitly: the inferred type points into @ranza/db's generated
// client, which is not portable across package boundaries (TS2742).
export const authPrisma: PrismaClient = createPrismaClient(authDatabaseUrl());

export const auth = betterAuth({
  database: prismaAdapter(authPrisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // Prefixed so auth_user is never mistaken for Ranza's users table.
  user: { modelName: "authUser" },
  session: { modelName: "authSession" },
  account: { modelName: "authAccount" },
  verification: { modelName: "authVerification" },
});

export type Auth = typeof auth;
