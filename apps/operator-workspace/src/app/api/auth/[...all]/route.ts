import { getComposition } from "../../../../server/composition";

/**
 * Better Auth owns every authentication route beneath this path: sign-in,
 * sign-out, session, verification. It authenticates only — what a Staff Member
 * may then do is decided by Ranza and Postgres (ADR 0005).
 *
 * The handler is resolved per request rather than at module load, so building
 * the application needs no database and no secret.
 */
const handler = (request: Request) => getComposition().auth.handler(request);

export { handler as GET, handler as POST };
