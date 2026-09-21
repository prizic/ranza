import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TODAY_CAPABILITY } from "@ranza/core";
import type { CapabilityRef, EntitledProperty } from "@ranza/core";
import { FOLIO_CAPABILITY } from "@ranza/folios";
import type { FolioDetail, FolioSummary } from "@ranza/folios";
import { FRONT_DESK_CAPABILITY } from "@ranza/reservations";
import type {
  Arrival,
  BookableUnit,
  Departure,
  ReservationRow,
} from "@ranza/reservations";
import { ROOMS_CAPABILITY } from "@ranza/accommodation";
import type {
  AccommodationUnitStatus,
  AccommodationUnitType,
  NewUnits,
  UnitCounts,
  UnitEntry,
  UnitMap,
  UnitsAdded,
  UnitState,
} from "@ranza/accommodation";
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
export {
  TODAY_CAPABILITY,
  FRONT_DESK_CAPABILITY,
  FOLIO_CAPABILITY,
  ROOMS_CAPABILITY,
};
export type {
  AccommodationUnitStatus,
  AccommodationUnitType,
  Arrival,
  BookableUnit,
  Departure,
  FolioDetail,
  FolioSummary,
  NewUnits,
  ReservationRow,
  UnitCounts,
  UnitEntry,
  UnitMap,
  UnitsAdded,
  UnitState,
};

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

/**
 * The Property's current and upcoming Reservations — the booking list.
 *
 * Same funnel and same non-checking as `arrivals`: a Property the viewer cannot
 * reach produces an empty list because the policies and the capability gate
 * decide that, not a condition here.
 *
 * Not `cache`d, for the same reason none of the front-desk reads are: taking a
 * booking changes this, and the request that took one then re-reads must see it.
 */
export async function reservations(
  propertyId: string,
): Promise<readonly ReservationRow[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().reservations.listReservations(
    viewer.userId,
    propertyId,
  );
}

/**
 * The Units a booking may be placed on.
 *
 * Every Unit in service, not the free ones. Availability over particular nights
 * is an exclusion constraint's answer, and a list filtered here would be true
 * when the page rendered and stale by the time somebody pressed the button.
 */
export async function bookableUnits(
  propertyId: string,
): Promise<readonly BookableUnit[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().reservations.listBookableUnits(
    viewer.userId,
    propertyId,
  );
}

/**
 * The Folios at one Property, with the balance of each — the Finance read.
 *
 * Same funnel and same non-checking as `arrivals`: a Property the viewer
 * cannot reach produces an empty list because the policies and the capability
 * gate decide that, not a condition here.
 *
 * Not `cache`d, for the same reason the front-desk reads are not: posting a
 * charge changes this, and a request that posts one then re-reads must see it.
 */
export async function folios(
  propertyId: string,
): Promise<readonly FolioSummary[]> {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().folios.listFolios(viewer.userId, propertyId);
}

/**
 * One Folio and its lines.
 *
 * Null for a Folio the viewer cannot reach and for one that does not exist,
 * which are the same answer on purpose — a `?folio=` somebody guessed must be
 * indistinguishable from one that was never there.
 */
export async function folio(folioId: string): Promise<FolioDetail | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().folios.folioDetail(viewer.userId, folioId);
}

/**
 * Every Unit at one Property and what each is doing tonight (RB-S1-01).
 *
 * Same funnel and same non-checking: a Property the viewer cannot reach,
 * or one whose capability is off, produces an empty list because the policies
 * and the capability gate decide that, not a condition here.
 */
export async function rooms(propertyId: string): Promise<UnitMap> {
  const viewer = await currentViewer();
  if (!viewer) {
    return {
      today: new Date().toISOString().slice(0, 10),
      units: [],
      counts: {
        rooms: 0,
        sellable: 0,
        inHouse: 0,
        reserved: 0,
        free: 0,
        blocked: 0,
        outOfService: 0,
      },
    };
  }
  return getComposition().accommodation.listUnits(viewer.userId, propertyId);
}
