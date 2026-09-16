import { arrivals, currentViewer } from "../../../../server/viewer";

/**
 * Today's arrivals, for a screen that polls.
 *
 * A client hook cannot call `src/server/` directly, so a live screen needs one
 * of these. It is the same funnel with one more entrance, and the entrance is
 * narrow by rule: this file calls `src/server/` and nothing else — never a
 * module, never Prisma, never `@ranza/db`. `.dependency-cruiser.cjs` enforces
 * that, because `src/app/api/` is not `src/server/`.
 *
 * Nothing here decides who may see what. `arrivals()` runs inside the viewer's
 * own request context and the policies answer; a Property in another
 * Organization returns an empty list, which is the same answer as a quiet day
 * and deliberately indistinguishable from it.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  // 401 with no body. Not a redirect: this is fetched by a screen that is
  // already open, and a redirect here would be parsed as data.
  if (!viewer) return new Response(null, { status: 401 });

  const property = new URL(request.url).searchParams.get("property") ?? "";
  // A malformed id would reach the database as a failed cast and come back as a
  // 500, which tells the caller their guess was the wrong shape. Empty tells
  // them nothing, which is the same thing an unreachable Property tells them.
  if (!UUID.test(property)) return Response.json({ arrivals: [] });

  return Response.json({ arrivals: await arrivals(property) });
}
