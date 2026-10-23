import { acceptInvitation } from "../../../../server/invitation";

/**
 * Where the invitation page posts: choose a password, or accept as somebody
 * already signed in. A route and not a server action because creating a login
 * has to hand the browser its session cookie in the same response.
 *
 * It decides nothing itself — `src/server/invitation.ts` proves the token is
 * live before it creates a credential (PEOPLE-01).
 */
export async function POST(request: Request): Promise<Response> {
  return acceptInvitation(request);
}
