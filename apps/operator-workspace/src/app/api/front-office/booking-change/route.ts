import { bookingChangePreview, currentViewer } from "../../../../server/viewer";

/**
 * What changing a booking to other nights would do, for the Change booking
 * dialog, which asks again each time the dates change (AB-S1-07).
 *
 * The same narrow entrance as the room calendar's route: this file calls
 * `src/server/` and nothing else, and nothing here decides who may see what.
 * A failed read is logged with the booking and the viewer, and no Guest data,
 * before the dialog is told it could not check those nights.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const search = new URL(request.url).searchParams;
  const reservation = search.get("reservation") ?? "";
  if (!UUID.test(reservation)) return Response.json({ kind: "refused" });

  try {
    const answer = await bookingChangePreview(
      reservation,
      search.get("from") ?? "",
      search.get("to") || null,
    );
    return Response.json(answer);
  } catch (error: unknown) {
    console.error("booking_change.preview_failed", {
      reservationId: reservation,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
