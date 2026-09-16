import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TODAY_CAPABILITY } from "@ranza/core";
import type { CapabilityRef, EntitledProperty } from "@ranza/core";
import { FRONT_DESK_CAPABILITY } from "@ranza/reservations";
import type { Arrival, Departure } from "@ranza/reservations";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { getComposition } from "./composition";

/**
 * The single funnel from a request to tenant data (ADR 0007).
 *
 * Reading a tenant-owned table takes three steps, and skipping any one of them
 * produces the same symptom: policies see a null acting user, deny everything,
 * and the page renders empty. That fails safe and reads as a data problem,
 * which is the most expensive kind of bug to chase. So the three steps live
 * here, together, once:
 *
 *   1. validate the session          (Better Auth, the ranza_auth client)
 *   2. map the provider subject to a Ranza user id  (auth_identities)
 *   3. run the read inside withOrganizationContext  (the ranza_app client)
 *
 * Step 3 happens inside @ranza/core, so it cannot be forgotten by a caller.
 * Nothing outside src/server/ may import @ranza/db or @ranza/core, which
 * .dependency-cruiser.cjs enforces and tests/boundaries proves.
 */

// Re-exported so a page never imports @ranza/core directly. The boundary rule
// is absolute rather than carved out for constants: an exception is the crack
// through which a direct query eventually arrives.
export { TODAY_CAPABILITY, FRONT_DESK_CAPABILITY };
export type { Arrival, Departure };

export interface Viewer {
  /** Ranza user id — what app.current_user_id() returns. Never a subject. */
  userId: string;
  email: string;
  /**
   * Whether this account carries a second factor. An authentication fact, not
   * an authorization one: it says how the session was obtained and never what
   * the Staff Member may reach.
   */
  twoFactorEnabled: boolean;
}

/**
 * Resolves the request's session to a Ranza user, or null when there is none.
 *
 * `cache` scopes the result to one request, so a layout and the page beneath it
 * validate the session once between them.
 */
export const currentViewer = cache(async (): Promise<Viewer | null> => {
  // Read first, and before anything else touches the composition: this is what
  // marks every page below as request-scoped, so none of them is prerendered
  // with somebody else's session or with no session at all.
  const requestHeaders = await headers();

  const { auth, linkRanzaUser } = getComposition();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  // Idempotent, and the designed seam of ADR 0005: an authenticated subject
  // always has a Ranza user, but that user belongs to no Organization until a
  // membership is granted. Provisioning it here grants nothing.
  const userId = await linkRanzaUser({
    subject: session.user.id,
    email: session.user.email,
  });
  return {
    userId,
    email: session.user.email,
    twoFactorEnabled: session.user.twoFactorEnabled === true,
  };
});

/** Sends an unauthenticated visitor to sign in rather than to an empty page. */
export async function requireViewer(locale: SupportedLocale): Promise<Viewer> {
  const viewer = await currentViewer();
  if (!viewer) redirect(localizeHref(locale, "sign-in"));
  return viewer;
}

/**
 * Every Property the viewer may use `capability` in — the only tenant read the
 * application performs.
 *
 * Empty for an unauthenticated visitor, for a user with no membership, and for
 * a Property whose Organization lost the Entitlement. Those are different
 * situations with deliberately identical answers: what a viewer may not reach
 * should not be distinguishable from what does not exist.
 */
export const entitledProperties = cache(
  async (capability: CapabilityRef): Promise<readonly EntitledProperty[]> => {
    const viewer = await currentViewer();
    if (!viewer) return [];
    return getComposition().core.listEntitledProperties(
      viewer.userId,
      capability,
    );
  },
);

/**
 * The Reservations arriving today at one Property — the Front Office read.
 *
 * It does not re-check that the viewer may reach `propertyId`. A Property they
 * cannot reach produces an empty list, because the policies and the capability
 * gate inside the module decide that, and a second check here would be the
 * weaker of the two while inviting somebody to trust it instead.
 *
 * Not `cache`d on the capability the way `entitledProperties` is: this list
 * changes when somebody checks a Guest in, and a request that does so then
 * re-reads must see the result.
 */
export async function arrivals(
  propertyId: string,
): Promise<readonly Arrival[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().reservations.listArrivals(viewer.userId, propertyId);
}

/**
 * The Stays due to leave today at one Property, and any already overdue.
 *
 * Same funnel and same non-checking as `arrivals`: a Property the viewer cannot
 * reach produces an empty list because the policies and the capability gate
 * decide that, not a condition here.
 */
export async function departures(
  propertyId: string,
): Promise<readonly Departure[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().reservations.listDepartures(
    viewer.userId,
    propertyId,
  );
}
