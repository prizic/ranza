import { currentViewer, guestMovePreview } from "../../../../server/viewer";

/**
 * Where an in-house Guest could be moved, for the Move Guest dialog
 * (AB-S3-03, AB-S3-04). The same narrow entrance as the other change routes.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const stay = new URL(request.url).searchParams.get("stay") ?? "";
  if (!UUID.test(stay)) return Response.json({ kind: "refused" });

  try {
    return Response.json(await guestMovePreview(stay));
  } catch (error: unknown) {
    console.error("guest_move.preview_failed", {
      stayId: stay,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
