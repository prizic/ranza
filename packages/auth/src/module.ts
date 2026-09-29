import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";
import { AUTH_ISSUER, TOTP_ISSUER, type LinkRanzaUserInput } from "./contracts";
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
    // Blueprint 7.6 lists rate limiting in the security baseline. The table is
    // shared rather than in-process, because a per-instance counter is not a
    // limit — it is the limit multiplied by however many instances are running,
    // and nothing in the response says so.
    //
    // Better Auth's built-in rules are kept: /sign-in, /sign-up and
    // /change-password at three per ten seconds, /two-factor/* likewise. That
    // second one is what bounds guessing a six-digit code, because a burned
    // challenge is replaced by signing in again (ADR 0010, amendment).
    rateLimit: {
      ...(deps.rateLimit === undefined ? {} : { enabled: deps.rateLimit }),
      storage: "database",
      modelName: "authRateLimit",
    },
    user: { modelName: "authUser" },
    session: { modelName: "authSession" },
    account: { modelName: "authAccount" },
    verification: { modelName: "authVerification" },
    plugins: [
      twoFactor({
        // Shown in the authenticator app beside the code, so it has to be the
        // product name rather than a hostname: a Staff Member with several
        // accounts needs to know which entry is which.
        issuer: TOTP_ISSUER,
        // Left at its default of false, deliberately. Enrolment writes the
        // secret with verified = false and does NOT set twoFactorEnabled; only
        // a correct code does both. A mis-scanned QR therefore costs a retry
        // rather than an account, which is the failure mode MFA actually has.
        skipVerificationOnEnable: false,
        schema: { twoFactor: { modelName: "authTwoFactor" } },
      }),
    ],
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

    try {
      return await deps.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: input.email },
          select: { id: true },
        });
        await tx.authIdentity.create({
          data: { userId: user.id, issuer, subject: input.subject },
        });
        return user.id;
      });
    } catch (error) {
      // Two first sign-ins of one subject both found no identity above, and
      // under READ COMMITTED nothing inside a transaction would have stopped
      // them. The unique indexes do: users on lower(email), auth_identities on
      // (issuer, subject). The loser's insert waits for the winner and then
      // fails, which aborts its transaction — so the winner is read here, in a
      // new one, rather than inside the one that cannot run another statement
      // (OA-S2-02).
      if (!isUniqueViolation(error)) throw error;
      const winner = await resolveRanzaUserId(input.subject, issuer);
      // No winner means the email belongs to a different person's Ranza user,
      // which is not a race and not this function's to resolve.
      if (!winner) throw error;
      return winner;
    }
  }

  return { auth, resolveRanzaUserId, linkRanzaUser };
}

/** A unique violation as Prisma reports one: P2002, raised from Postgres' 23505. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export type AuthModule = ReturnType<typeof createAuthModule>;
