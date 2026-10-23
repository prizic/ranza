import { currentViewer, guestLookup } from "../../../../server/viewer";

/**
 * Guests already on file that the name or number being typed into a new booking
 * may belong to, so a returning person is seen before a second record is made
 * (RES-05).
 *
 * The same narrow entrance as the other front-office routes: this file calls
 * `src/server/` and nothing else, and nothing here decides who may see what —
 * the module asks for `front_desk.book` itself. A failed read is logged with
 * the Property and the viewer, and nothing about the text typed, which is a
 * person's name.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const search = new URL(request.url).searchParams;
  const property = search.get("property") ?? "";
  if (!UUID.test(property)) return Response.json({ guests: [] });

  try {
    const guests = await guestLookup(property, search.get("q") ?? "");
    return Response.json({ guests });
  } catch (error: unknown) {
    console.error("guest_lookup.read_failed", {
      propertyId: property,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
