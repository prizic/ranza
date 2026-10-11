import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { StayBrand } from "@ranza/branding";
import type { OwnStay } from "@ranza/stays";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { getComposition } from "./composition";

/**
 * The Portal's funnel from a request to tenant data (ADR 0007).
 *
 * ADR 0007 says this applies per application and that the Portal needs its own
 * funnel rather than reusing the Workspace's. This is it, and the difference is
 * the whole point: the three steps are the same, but step 3 lands on a
 * different set of policies (ADR 0009).
 *
 *   1. validate the session          (Better Auth, the ranza_auth client)
 *   2. map the provider subject to a Ranza user id  (auth_identities)
 *   3. run the read inside withOrganizationContext  (the ranza_app client)
 *
 * Step 3 happens inside @ranza/stays, so a caller cannot forget it. Nothing
 * outside src/server/ may import @ranza/db or a Ranza domain module, which
 * .dependency-cruiser.cjs enforces and tests/boundaries proves.
 *
 * Every tenant read below is Stay-scoped: the Stays, and the brand of the
 * Organization each is with. That is not a convention to be extended casually:
 * a Portal read that is not bounded by the viewer's own Stay does not belong in
 * this application at all.
 */

export interface Viewer {
  /** Ranza user id — what app.current_user_id() returns. Never a subject. */
  userId: string;
  email: string;
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

  // Idempotent, and the designed seam of ADR 0005. Note what it does not do:
  // signing in creates a Ranza user and nothing else. It grants no Stay, so a
  // stranger who signs up reaches exactly nothing.
  const userId = await linkRanzaUser({
    subject: session.user.id,
    email: session.user.email,
  });
  return { userId, email: session.user.email };
});

/** Sends an unauthenticated visitor to sign in rather than to an empty page. */
export async function requireViewer(locale: SupportedLocale): Promise<Viewer> {
  const viewer = await currentViewer();
  if (!viewer) redirect(localizeHref(locale, "sign-in"));
  return viewer;
}

/**
 * The viewer's own current Stays — the only tenant read this application makes.
 *
 * Empty for an unauthenticated visitor, for someone with no Stay, for a
 * departed Resident, for a Staff Member who happens to sign in here, and for a
 * Property whose Organization is not entitled to the capability. Those are
 * different situations with deliberately identical answers: what a viewer may
 * not reach should not be distinguishable from what does not exist.
 */
export const ownStays = cache(async (): Promise<readonly OwnStay[]> => {
  const viewer = await currentViewer();
  if (!viewer) return [];
  return getComposition().stays.listOwnStays(viewer.userId);
});

/**
 * How each of the viewer's own current Stays is branded (ADR 0046), by Stay: a
 * Resident reaches an Organization only through a Stay and is not told its
 * identity (ADR 0009). An Organization that set nothing, or reset it, has a
 * Stay with no colour and no logo, which is the default theme.
 *
 * A failure to read it is reported and answered with the default theme, not
 * with an error page: a Guest who could not see their own Stay because the
 * colour of the Organization could not be read would have lost what the Portal
 * is for to something that is only decoration. The report is the console, as it
 * is for the sign-in form, which is this application's only reporter so far.
 */
export const stayBrands = cache(async (): Promise<readonly StayBrand[]> => {
  const viewer = await currentViewer();
  if (!viewer) return [];
  try {
    return await getComposition().branding.stayBrands(viewer.userId);
  } catch (error: unknown) {
    console.error("branding.read_failed", { userId: viewer.userId }, error);
    return [];
  }
});
