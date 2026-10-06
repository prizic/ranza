import { getComposition } from "../../../../server/composition";
import {
  FORGET_PROPERTY,
  forgetsTheChoice,
} from "../../../../lib/property-choice";

/**
 * Better Auth owns every authentication route beneath this path: sign-in,
 * sign-out, session, verification. It authenticates only — what a Staff Member
 * may then do is decided by Ranza and Postgres (ADR 0005).
 *
 * The handler is resolved per request rather than at module load, so building
 * the application needs no database and no secret.
 */
const handler = async (request: Request): Promise<Response> => {
  const response = await getComposition().auth.handler(request);
  if (!forgetsTheChoice(new URL(request.url).pathname)) return response;
  // Signing in or out ends the last person's remembered Property (OA-S3-05).
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", FORGET_PROPERTY);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export { handler as GET, handler as POST };
