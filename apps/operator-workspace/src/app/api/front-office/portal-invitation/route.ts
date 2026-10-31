import { currentViewer } from "../../../../server/viewer";
import { portalInvitationOverview } from "../../../../server/portal-invitation";

/**
 * Where the invitation of the Guest one booking is for stands, read when the
 * desk opens the booking (GP-S2-11), so the Reservations list never carries it.
 *
 * The same narrow entrance as the other front-office routes: this file calls
 * `src/server/` and nothing else, and nothing here decides who may invite. A
 * failed read is logged with the booking and the viewer.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const reservation =
    new URL(request.url).searchParams.get("reservation") ?? "";
  if (!UUID.test(reservation)) return Response.json({ overview: null });

  try {
    const overview = await portalInvitationOverview(reservation);
    return Response.json(
      { overview },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("portal_invitation.read_failed", {
      reservationId: reservation,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
