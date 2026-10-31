"use server";

import { isSupportedLocale } from "@ranza/i18n";
import { PortalInvitationRefusedError } from "@ranza/stays";
import { getComposition, portalOrigin } from "./composition";
import { requireViewer } from "./viewer";

/**
 * Making and withdrawing the link a Guest opens on the Portal (RANZ-87).
 *
 * The same funnel as every other write here (ADR 0007): the session is resolved
 * and the module asks. Whether this viewer may invite, whether the Portal is on
 * and whether the Guest already has a login are the database's answers.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * What the sheet shows afterwards. `issued` carries the link, and the link is
 * only ever in this answer: the token is stored nowhere (GP-S2-03).
 * `no_address` is a workspace that was never told where the Portal is; it is
 * said, not worked around, because a link to the wrong host opens nothing.
 */
export type InviteToPortalOutcome =
  | {
      status: "issued";
      url: string;
      expiresAt: string;
      replacedEarlier: boolean;
    }
  | { status: "refused"; reason: "not_allowed" | "already_connected" }
  | { status: "no_address" }
  | { status: "failed" };

export type WithdrawPortalInvitationOutcome =
  "withdrawn" | "nothing_to_withdraw" | "refused" | "failed";

function is(error: unknown): error is PortalInvitationRefusedError {
  return (
    error instanceof PortalInvitationRefusedError ||
    (error instanceof Error && error.name === "PortalInvitationRefusedError")
  );
}

export async function inviteToPortal(
  locale: string,
  reservationId: string,
): Promise<InviteToPortalOutcome> {
  if (!isSupportedLocale(locale) || !UUID.test(reservationId)) {
    return { status: "failed" };
  }
  const viewer = await requireViewer(locale);
  // Asked before the invitation is made: a link made and then not shown would
  // withdraw the live one for nothing.
  const origin = portalOrigin();
  if (!origin) return { status: "no_address" };

  try {
    const issued = await getComposition().stays.invite(
      viewer.userId,
      reservationId,
    );
    return {
      status: "issued",
      url: `${origin}/invite/${issued.token}`,
      expiresAt: issued.expiresAt,
      replacedEarlier: issued.replacedEarlier,
    };
  } catch (error: unknown) {
    if (is(error)) return { status: "refused", reason: error.reason };
    console.error(
      "portal_invitation.invite_failed",
      { reservationId, userId: viewer.userId },
      error,
    );
    return { status: "failed" };
  }
}

export async function withdrawPortalInvitation(
  locale: string,
  reservationId: string,
): Promise<WithdrawPortalInvitationOutcome> {
  if (!isSupportedLocale(locale) || !UUID.test(reservationId)) return "failed";
  const viewer = await requireViewer(locale);
  try {
    return (await getComposition().stays.withdraw(viewer.userId, reservationId))
      ? "withdrawn"
      : "nothing_to_withdraw";
  } catch (error: unknown) {
    if (is(error)) return "refused";
    console.error(
      "portal_invitation.withdraw_failed",
      { reservationId, userId: viewer.userId },
      error,
    );
    return "failed";
  }
}
