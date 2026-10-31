import { currentViewer, guestParticulars } from "../../../../server/viewer";

/**
 * The particulars of the Guest one booking is for, read when the desk opens it
 * (GP-S1-05), so the Reservations list never carries every student's date of
 * birth and guardian to the browser.
 *
 * The same narrow entrance as the other front-office routes: this file calls
 * `src/server/` and nothing else, and nothing here decides who may see what —
 * the table's policy asks for `guests.read_particulars`. A failed read is
 * logged with the booking and the viewer, never with what it would have
 * returned.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const reservation =
    new URL(request.url).searchParams.get("reservation") ?? "";
  if (!UUID.test(reservation)) return Response.json({ particulars: null });

  try {
    const particulars = await guestParticulars(reservation);
    return Response.json(
      { particulars },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("guest_particulars.read_failed", {
      reservationId: reservation,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
