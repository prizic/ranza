import { acceptInvitation } from "../../../../server/portal-invitation";
import { currentViewer } from "../../../../server/viewer";

/**
 * Accepts a Guest's link as the signed-in student (GP-S3-*).
 *
 * The answer is the database's, passed on: a link that does not work is an
 * outcome the page words, not an error. A fault is a 500 and is written to the
 * log with the viewer and nothing of the token, which is a credential; neither
 * application has a reporter yet (GP-DEF-04).
 *
 * Two guards against a page on another site making somebody's browser accept
 * a stranger's link: the body must be JSON, which a cross-site form cannot
 * send without a preflight, and an `Origin` that is not this site is refused.
 */

const TOKEN_MAX_LENGTH = 200;

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return new Response(null, { status: 415 });
  }

  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const token =
    typeof body === "object" &&
    body !== null &&
    "token" in body &&
    typeof body.token === "string" &&
    body.token.length <= TOKEN_MAX_LENGTH
      ? body.token
      : null;
  if (token === null) return new Response(null, { status: 400 });

  try {
    const acceptance = await acceptInvitation(token);
    if (!acceptance) return new Response(null, { status: 401 });
    return Response.json(acceptance, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    console.error(
      "portal_invitation.accept_failed",
      { userId: viewer.userId },
      error,
    );
    return new Response(null, { status: 500 });
  }
}
