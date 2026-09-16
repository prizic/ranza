import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@ranza/db";

/**
 * Authentication only. Better Auth owns sessions, credentials and MFA, and owns
 * its own tables.
 *
 * It does not own authorization. Roles, Property assignments, Entitlements and
 * tenant isolation belong to Ranza and Postgres — see ADR 0005. Nothing here
 * decides what a Staff Member may do.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});

export type Auth = typeof auth;
