import {
  currentViewer,
  revealIdentityDocument,
} from "../../../../server/viewer";

/**
 * The document number of the Guest one booking is for, in full, asked for by
 * the desk (PA-S2-*). A POST, not a GET: reading it writes the record that it
 * was shown, and a link that does that is one a prefetch or a crawler follows.
 *
 * The same narrow entrance as the other front-office routes: nothing here
 * decides who may see it — the database function asks `guests.read_particulars`
 * — and the module records the reveal in the transaction that reads it. A
 * failed read is logged with the booking and the viewer, never with the
 * number.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const reservation =
    new URL(request.url).searchParams.get("reservation") ?? "";
  if (!UUID.test(reservation)) return Response.json({ document: null });

  try {
    const document = await revealIdentityDocument(reservation);
    return Response.json(
      { document },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("guest_identity_document.reveal_failed", {
      reservationId: reservation,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
