import "server-only";
import type { PortalInvitationOverview } from "@ranza/stays";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * Where the invitation of a booking's Guest stands, read when the desk opens the
 * booking (GP-S2-11). Null for anybody not signed in and for a booking with no
 * Guest to invite, which a walk-in is. Not `cache`d: making a link changes it,
 * and the sheet reads it again straight after.
 */
export async function portalInvitationOverview(
  reservationId: string,
): Promise<PortalInvitationOverview | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().stays.overview(viewer.userId, reservationId);
}
