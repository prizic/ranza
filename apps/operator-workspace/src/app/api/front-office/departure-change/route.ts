import {
  currentViewer,
  departureChangePreview,
} from "../../../../server/viewer";

/**
 * What changing an in-house Guest's departure would do, for the Change
 * departure dialog, asked again whenever the chosen day changes (AB-S2-02).
 * The same narrow entrance as the booking-change route beside it.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const search = new URL(request.url).searchParams;
  const stay = search.get("stay") ?? "";
  if (!UUID.test(stay)) return Response.json({ kind: "refused" });

  try {
    return Response.json(
      await departureChangePreview(stay, search.get("to") || null),
    );
  } catch (error: unknown) {
    console.error("departure_change.preview_failed", {
      stayId: stay,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
