import "server-only";
import { serveLogo } from "@ranza/branding";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * An Organization's logo, for the Branding screen's preview (ADR 0046).
 *
 * Only Staff who may manage the Organization's brand read it here; for anyone
 * else, an Organization with no logo and one that does not exist are the same
 * bodiless 404. The Portal serves the same bytes to Residents from its own
 * route, under its own policy.
 */
export async function brandLogoResponse(
  request: Request,
  organizationId: string,
): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });
  if (!UUID.test(organizationId)) return new Response(null, { status: 404 });

  try {
    const logo = await getComposition().branding.logoOf(
      viewer.userId,
      organizationId,
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
    console.error("branding.logo_failed", { organizationId, error });
    return new Response(null, { status: 500 });
  }
}
