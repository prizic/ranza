/** Issuer recorded in auth_identities for the built-in provider (ADR 0005). */
export const AUTH_ISSUER = "better-auth";

export interface LinkRanzaUserInput {
  subject: string;
  email: string;
  issuer?: string;
}

export interface LinkInvitedUserInput {
  /** The provider's id for the account that was just created. */
  subject: string;
  /** The Ranza user an invitation made, who has no login yet. */
  userId: string;
  issuer?: string;
}

/**
 * Why an account could not be given to an invited person.
 *
 * Their own type so the host can tell "this is not that person's account"
 * from a fault, and report only the second.
 */
export class InvitedUserLinkError extends Error {
  constructor(
    readonly reason: "no_account" | "not_their_address" | "has_login",
  ) {
    super(`an invited person could not be linked: ${reason}`);
    this.name = "InvitedUserLinkError";
  }
}

/**
 * Label an authenticator app shows beside the code.
 *
 * The product name rather than a hostname, because the Workspace and the Portal
 * are one identity across two origins (ADR 0005): a Staff Member enrolling once
 * should see one entry, not two that look unrelated.
 */
export const TOTP_ISSUER = "Ranza";
