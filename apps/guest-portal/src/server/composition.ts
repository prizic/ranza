import "server-only";
import { createAuthModule } from "@ranza/auth";
import { assertUnprivileged, createPrismaClient } from "@ranza/db";
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
 * and another (ADR 0009).
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

/**
 * A runtime connection's URL, refused by name when it is the migration one.
 *
 * A privileged runtime connection is the failure this repository has already
 * seen once: policies stay correct and stop applying. Owners and BYPASSRLS
 * roles cannot be detected from a URL — `verifyConnections` asks the database
 * about those — but the migration role can, and "you pasted the wrong URL" is a
 * more useful refusal than "your role owns tables".
 */
function runtimeUrl(name: "DATABASE_URL" | "AUTH_DATABASE_URL"): string {
  const url = required(name);
  if (url === process.env.DIRECT_URL) {
    throw new Error(
      `${name} must not be the migration connection: its role owns the tables, so row-level security would not apply`,
    );
  }
  return url;
}

/**
 * Asks the database what both runtime connections actually connect as, and
 * refuses a superuser, a BYPASSRLS role, or one that owns a table — the check
 * the worker makes (ADR 0018, amended; OA-S1-05). `src/instrumentation.ts`
 * runs it once, before the server takes its first request.
 *
 * Its own short-lived clients rather than the composition's, so that asking
 * does not hand a raw client to anything that could reach past the modules.
 */
export async function verifyConnections(): Promise<void> {
  for (const name of ["DATABASE_URL", "AUTH_DATABASE_URL"] as const) {
    const db = createPrismaClient(runtimeUrl(name));
    try {
      await assertUnprivileged(db, name);
    } finally {
      await db.$disconnect();
    }
  }
}

function compose() {
  const tenantDb = createPrismaClient(runtimeUrl("DATABASE_URL"));
  const authDb = createPrismaClient(runtimeUrl("AUTH_DATABASE_URL"));

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
