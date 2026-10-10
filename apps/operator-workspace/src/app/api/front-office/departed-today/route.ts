import { currentViewer, departedToday } from "../../../../server/viewer";

/**
 * The Guests already checked out today, for a screen that polls.
 *
 * The departures route's twin and narrow by the same rule: it calls
 * `src/server/` and nothing else, and decides nothing about who may see what.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  // 401 with no body, not a redirect: an open screen fetches this, and a
  // redirect would be parsed as data.
  if (!viewer) return new Response(null, { status: 401 });

  const property = new URL(request.url).searchParams.get("property") ?? "";
  // A malformed id would come back as a 500 from a failed cast, telling the
  // caller their guess was the wrong shape. Empty tells them nothing.
  if (!UUID.test(property)) return Response.json({ departed: [] });

  return Response.json({ departed: await departedToday(property) });
}
