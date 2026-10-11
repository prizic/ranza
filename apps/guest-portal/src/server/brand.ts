import "server-only";
import { serveLogo } from "@ranza/branding";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The logo of the Organization one of the viewer's own current Stays is with
 * (ADR 0046). A Stay that is not theirs, has departed, or whose Organization
 * set no logo is the same bodiless 404, so the route is no way to learn which
 * Stays or logos exist.
 *
 * Everything that decides who may read the bytes is the database's: the
 * Resident policy on the logo table, keyed on a current Stay of their own
 * (ADR 0009). The page links here with `?v=<hash>`, which is what lets a
 * changed logo show on the next load while an unchanged one is cached.
 */
export async function brandLogoResponse(
  request: Request,
  stayId: string,
): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });
  if (!UUID.test(stayId)) return new Response(null, { status: 404 });

  try {
    const logo = await getComposition().branding.logoOfStay(
      viewer.userId,
      stayId,
    );
    if (!logo) return new Response(null, { status: 404 });

    const answer = serveLogo(logo, {
      version: new URL(request.url).searchParams.get("v"),
      ifNoneMatch: request.headers.get("if-none-match"),
    });
    return new Response(answer.body ?? null, {
      status: answer.status,
      headers: answer.headers,
    });
  } catch (error: unknown) {
    console.error("branding.logo_failed", { stayId, error });
    return new Response(null, { status: 500 });
  }
}
