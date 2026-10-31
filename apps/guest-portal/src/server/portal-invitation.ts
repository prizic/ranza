import "server-only";
import type { PortalAcceptance, PortalLink } from "@ranza/stays";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * The two reads and the one write behind the link a desk hands a Guest
 * (RANZ-87, GP-S3-*).
 *
 * The link's state is read without a session, because the person holding it
 * cannot sign in yet and the argument is a digest of 256 random bits: nobody
 * can name a row they do not hold. Accepting is the write, and it is made as
 * the signed-in user and never as an argument.
 */

/** What the page behind a link may say. Null is a link that never existed. */
export async function invitationLink(
  token: string,
): Promise<PortalLink | null> {
  return getComposition().stays.link(token);
}

/** Accepts the link as the signed-in user; null when there is no session. */
export async function acceptInvitation(
  token: string,
): Promise<PortalAcceptance | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  return getComposition().stays.accept(viewer.userId, token);
}
