import type { PrismaClient } from "@ranza/db";

/**
 * What the host must provide for this module to work.
 *
 * Nothing here is read from the environment. The module cannot create its own
 * database connection or discover its own secret, which is what makes it
 * testable against a throwaway database and portable to another host.
 */
export interface AuthDeps {
  /**
   * Client for the credential tables. Must be connected as a role that can
   * reach auth_user, auth_session, auth_account and auth_verification —
   * ranza_auth, never the tenant query path's role.
   */
  db: PrismaClient;

  /** Signing secret for sessions. */
  secret: string;

  /** Public origin, used when issuing links and cookies. */
  baseURL?: string;
}
