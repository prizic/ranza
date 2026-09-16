import { getComposition } from "../../../../server/composition";

/**
 * Better Auth owns every authentication route beneath this path: sign-in,
 * sign-out, session, verification. It authenticates only — what the person may
 * then see is decided by Ranza and Postgres (ADR 0005), and for a Guest or
 * Resident that means their own Stay and nothing else (ADR 0009).
 *
 * The same Better Auth instance serves the Workspace. That is deliberate: a
 * Resident is not a second kind of credential, only a second kind of reader.
 *
 * The handler is resolved per request rather than at module load, so building
 * the application needs no database and no secret.
 */
const handler = (request: Request) => getComposition().auth.handler(request);

export { handler as GET, handler as POST };
