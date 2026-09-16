import { authPrisma } from "./auth";

/** Issuer recorded in auth_identities for this provider (ADR 0005). */
export const AUTH_ISSUER = "better-auth";

/**
 * Maps an authentication provider's subject onto the Ranza user id that
 * policies actually resolve against.
 *
 * Keyed on (issuer, subject) rather than email, which changes. Adding a second
 * provider later means another issuer here, not a schema change.
 *
 * Returns null when the subject has no Ranza user. Callers must treat that as a
 * denial: app.current_user_id() would be null and every policy would deny.
 */
export async function resolveRanzaUserId(
  subject: string,
  issuer: string = AUTH_ISSUER,
): Promise<string | null> {
  const identity = await authPrisma.authIdentity.findUnique({
    where: { issuer_subject: { issuer, subject } },
    select: { userId: true },
  });
  return identity?.userId ?? null;
}

/**
 * Ensures a Ranza user exists for an authenticated subject, and returns its id.
 *
 * Ranza identity is deliberately separate from the provider's, so this is the
 * seam that keeps the provider replaceable. It creates nothing tenant-scoped: a
 * new user belongs to no Organization until someone grants a membership.
 *
 * Idempotent — a repeated sign-in returns the existing mapping rather than
 * creating a second identity for the same person.
 */
export async function linkRanzaUser(input: {
  subject: string;
  email: string;
  issuer?: string;
}): Promise<string> {
  const issuer = input.issuer ?? AUTH_ISSUER;

  const existing = await resolveRanzaUserId(input.subject, issuer);
  if (existing) return existing;

  return authPrisma.$transaction(async (tx) => {
    // Re-check inside the transaction: two concurrent sign-ins for the same
    // subject must not produce two Ranza users.
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
