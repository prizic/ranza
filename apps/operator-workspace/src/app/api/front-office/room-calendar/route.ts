import { currentViewer, roomCalendar } from "../../../../server/viewer";

/**
 * The room calendar, for a screen that polls and moves between windows.
 *
 * The same narrow entrance as the arrivals route: this file calls
 * `src/server/` and nothing else, and nothing here decides who may see what —
 * `roomCalendar()` runs inside the viewer's own request context and the
 * policies answer.
 *
 * A failed read is logged here with the Property and the viewer, and with no
 * Guest data, before the screen is told; the screen keeps its last calendar
 * and says it could not refresh (RC-S1-53).
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  // 401 with no body: fetched by a screen that is already open, where a
  // redirect would be parsed as data (RC-S1-47).
  if (!viewer) return new Response(null, { status: 401 });

  const search = new URL(request.url).searchParams;
  const property = search.get("property") ?? "";
  // A malformed id would reach the database as a failed cast and come back as
  // a 500; nothing is the same answer an unreachable Property gets.
  if (!UUID.test(property)) return Response.json({ calendar: null });

  const from = search.get("from") ?? "";
  const days = Number(search.get("days"));
  try {
    const calendar = await roomCalendar(property, {
      from: DAY.test(from) ? from : null,
      days: Number.isInteger(days) ? days : null,
    });
    return Response.json({ calendar });
  } catch (error: unknown) {
    console.error("room_calendar.read_failed", {
      propertyId: property,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
