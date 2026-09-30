import { bookingAvailability, currentViewer } from "../../../../server/viewer";

/**
 * Which Units are taken over the nights being booked, for the New reservation
 * dialog, which asks again each time the dates change (RG-S4-06).
 *
 * The same narrow entrance as the Change booking route: this file calls
 * `src/server/` and nothing else, and nothing here decides who may see what.
 * A failed read is logged with the Property and the viewer, and nothing about
 * a Guest, before the dialog is told it could not check those nights.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const search = new URL(request.url).searchParams;
  const property = search.get("property") ?? "";
  if (!UUID.test(property)) return Response.json({ kind: "refused" });

  try {
    const answer = await bookingAvailability(
      property,
      search.get("from") ?? "",
      search.get("to") || null,
    );
    return Response.json(answer);
  } catch (error: unknown) {
    console.error("booking_availability.read_failed", {
      propertyId: property,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
