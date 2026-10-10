import { currentViewer, todayStrip } from "../../../../server/viewer";

/**
 * The Organization strip's figures: each Property of the Organization the viewer
 * has Today at, with the occupancy and attention count of its own Today
 * (TD-S3-03).
 *
 * The same narrow entrance as `api/today`: this file calls `src/server/` and
 * nothing else, and decides nothing about who may see what. A Property out of
 * reach, an id that is not one, and a viewer with a single Property all answer
 * an empty strip.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  // 401 with no body, never a redirect a polling screen would parse as data.
  if (!viewer) return new Response(null, { status: 401 });

  const property = new URL(request.url).searchParams.get("property") ?? "";
  if (!UUID.test(property)) return Response.json({ entries: [] });

  try {
    return Response.json({ entries: await todayStrip(property) });
  } catch (error: unknown) {
    console.error("today.strip_route_failed", {
      propertyId: property,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
