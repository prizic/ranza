/** Issuer recorded in auth_identities for the built-in provider (ADR 0005). */
export const AUTH_ISSUER = "better-auth";

export interface LinkRanzaUserInput {
  subject: string;
  email: string;
  issuer?: string;
}
