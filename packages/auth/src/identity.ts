import { prisma } from "@ranza/db";

/** Issuer recorded in auth_identities for this provider (ADR 0005). */
export const AUTH_ISSUER = "better-auth";

/**
 * Maps a provider subject onto the Ranza user id that policies actually use.
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
  const identity = await prisma.authIdentity.findUnique({
    where: { issuer_subject: { issuer, subject } },
    select: { userId: true },
  });
  return identity?.userId ?? null;
}
