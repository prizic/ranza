import { currentViewer, todaySummary } from "../../../server/viewer";

/**
 * Today's summary, for the dashboard that polls it.
 *
 * The same narrow entrance as `api/front-office/arrivals`: this file calls
 * `src/server/` and nothing else. It decides nothing about who may see what —
 * the summary is derived on the server for this viewer, so a figure they may
 * not see is not in the answer at all rather than hidden in the page.
 *
 * A Property out of reach and one that does not exist both answer
 * `{ summary: null }` (TD-S1-05), and so does an id that is not one (TD-S1-06).
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  // 401 with no body, never a redirect: a polling screen would parse one as
  // data (TD-S1-07).
  if (!viewer) return new Response(null, { status: 401 });

  const property = new URL(request.url).searchParams.get("property") ?? "";
  if (!UUID.test(property)) return Response.json({ summary: null });

  return Response.json({ summary: await todaySummary(property) });
}
