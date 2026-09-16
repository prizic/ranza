import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { AUTH_ISSUER, type LinkRanzaUserInput } from "./contracts";
import type { AuthDeps } from "./ports";

/**
 * Authentication only. Better Auth owns sessions, credentials and MFA.
 *
 * It does not own authorization. Roles, Property assignments, Entitlements and
 * tenant isolation belong to Ranza and Postgres (ADR 0005). Nothing here decides
 * what a Staff Member may do.
 *
 * Tables are prefixed auth_ because Better Auth's default table is named `user`
 * and Ranza's is `users` — one character apart, and different things. They are
 * reached through a role the tenant query path is granted nothing on, so a
 * defect there cannot read password hashes or session tokens.
 */
export function createAuthModule(deps: AuthDeps) {
  const auth = betterAuth({
    database: prismaAdapter(deps.db, { provider: "postgresql" }),
    emailAndPassword: { enabled: true },
    secret: deps.secret,
    baseURL: deps.baseURL,
    user: { modelName: "authUser" },
    session: { modelName: "authSession" },
    account: { modelName: "authAccount" },
    verification: { modelName: "authVerification" },
  });

  /**
   * Maps a provider subject onto the Ranza user id that policies resolve
   * against. Keyed on (issuer, subject) rather than email, which changes.
   *
   * Returns null when the subject has no Ranza user. Callers must treat that as
   * a denial: app.current_user_id() would be null and every policy would deny.
   */
  async function resolveRanzaUserId(
    subject: string,
    issuer: string = AUTH_ISSUER,
  ): Promise<string | null> {
    const identity = await deps.db.authIdentity.findUnique({
      where: { issuer_subject: { issuer, subject } },
      select: { userId: true },
    });
    return identity?.userId ?? null;
  }

  /**
   * Ensures a Ranza user exists for an authenticated subject.
   *
   * This is the seam that keeps the provider replaceable. It creates nothing
   * tenant-scoped: a new user belongs to no Organization until a membership is
   * granted. Idempotent, so a repeated sign-in never produces a second identity
   * for the same person.
   */
  async function linkRanzaUser(input: LinkRanzaUserInput): Promise<string> {
    const issuer = input.issuer ?? AUTH_ISSUER;

    const existing = await resolveRanzaUserId(input.subject, issuer);
    if (existing) return existing;

    return deps.db.$transaction(async (tx) => {
      // Re-checked inside the transaction: two concurrent sign-ins for one
      // subject must not create two Ranza users.
      const raced = await tx.authIdentity.findUnique({
        where: { issuer_subject: { issuer, subject: input.subject } },
        select: { userId: true },
      });
      if (raced) return raced.userId;

      const user = await tx.user.create({
        data: { email: input.email },
        select: { id: true },
      });
      await tx.authIdentity.create({
        data: { userId: user.id, issuer, subject: input.subject },
      });
      return user.id;
    });
  }

  return { auth, resolveRanzaUserId, linkRanzaUser };
}

export type AuthModule = ReturnType<typeof createAuthModule>;
