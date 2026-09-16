/** Issuer recorded in auth_identities for the built-in provider (ADR 0005). */
export const AUTH_ISSUER = "better-auth";

export interface LinkRanzaUserInput {
  subject: string;
  email: string;
  issuer?: string;
}

/**
 * Label an authenticator app shows beside the code.
 *
 * The product name rather than a hostname, because the Workspace and the Portal
 * are one identity across two origins (ADR 0005): a Staff Member enrolling once
 * should see one entry, not two that look unrelated.
 */
export const TOTP_ISSUER = "Ranza";
