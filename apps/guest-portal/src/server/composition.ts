import "server-only";
import { createAuthModule } from "@ranza/auth";
import { createPrismaClient } from "@ranza/db";
import { createStaysModule } from "@ranza/stays";

/**
 * The composition root.
 *
 * Modules receive their dependencies and never discover them (ADR 0006), so
 * this is the one place in the application that reads the environment and opens
 * a connection. Three roles, three clients, and the separation is the security
 * boundary rather than a tidiness preference:
 *
 *   DATABASE_URL       ranza_app   tenant queries — RLS-subject, SELECT only
 *   AUTH_DATABASE_URL  ranza_auth  credentials — granted nothing tenant-owned
 *   DIRECT_URL         owner       migrations only; never opened here
 *
 * DIRECT_URL is deliberately absent below. It is the migration connection and
 * its role owns the tables, which means RLS does not apply to it. Using it to
 * serve a request would disable every policy at once while appearing to work —
 * and in this application the policies are the only thing between one Resident
 * and another (ADR 0008).
 *
 * @ranza/core is deliberately absent too. The Portal must never expose staff
 * controls (blueprint 4.3), and the strongest form of that is an application
 * which cannot express the question: nothing composed here can answer "which
 * Properties may this Staff Member reach".
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} must be set before the portal can serve a request`,
    );
  }
  return value;
}

function compose() {
  const tenantUrl = required("DATABASE_URL");

  // A privileged runtime connection is the failure this repository has already
  // seen once: policies stay correct and stop applying. Owners and BYPASSRLS
  // roles cannot be detected from a URL, but the migration role can.
  if (tenantUrl === process.env.DIRECT_URL) {
    throw new Error(
      "DATABASE_URL must not be the migration connection: its role owns the tables, so row-level security would not apply",
    );
  }

  const tenantDb = createPrismaClient(tenantUrl);
  const authDb = createPrismaClient(required("AUTH_DATABASE_URL"));

  const { auth, linkRanzaUser } = createAuthModule({
    db: authDb,
    secret: required("BETTER_AUTH_SECRET"),
    ...(process.env.BETTER_AUTH_URL
      ? { baseURL: process.env.BETTER_AUTH_URL }
      : {}),
  });

  return { auth, linkRanzaUser, stays: createStaysModule({ db: tenantDb }) };
}

type Composition = ReturnType<typeof compose>;

// Next's dev server re-evaluates modules on every edit. Without this the
// connection pool would grow with each save until the database refused more.
// It lives here rather than in packages/db because which process reuses a
// connection is an application concern (ADR 0006).
const globalForComposition = globalThis as typeof globalThis & {
  ranzaPortalComposition?: Composition;
};

/** Built on first use, so a build never needs a reachable database. */
export function getComposition(): Composition {
  return (globalForComposition.ranzaPortalComposition ??= compose());
}
