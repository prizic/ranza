/**
 * Talking to the authentication routes from the browser, and understanding what
 * came back. Shared by the sign-in form and the Security panel, which both post
 * to Better Auth and both used to decide for themselves what a refusal meant —
 * the panel decided "that password did not match" for a dropped connection.
 */

export type Failure = "mismatch" | "throttled" | "expired" | "unavailable";

/** Why a request did not succeed, and how long to wait when that is the answer. */
export interface Refusal {
  failure: Failure;
  /** Whole seconds Better Auth asked the caller to wait, for `throttled`. */
  retryAfter: number | null;
}

/**
 * Better Auth's codes for what was typed not matching — the only answers that
 * may say so. An allow-list, not the fallback: a 403 from the origin check
 * would otherwise tell somebody their correct password is wrong.
 */
const MISMATCH = new Set([
  "INVALID_EMAIL_OR_PASSWORD",
  "INVALID_EMAIL",
  "INVALID_PASSWORD",
  "INVALID_CODE",
  "INVALID_BACKUP_CODE",
]);

/**
 * The second-factor challenge is spent: five wrong codes end it, and it is
 * gone once it times out. Only a new sign-in starts another (ADR 0010), so no
 * code typed here can succeed.
 */
const EXPIRED = new Set([
  "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
  "INVALID_TWO_FACTOR_COOKIE",
]);

function codeOf(body: unknown): string | undefined {
  return typeof body === "object" &&
    body !== null &&
    "code" in body &&
    typeof body.code === "string"
    ? body.code
    : undefined;
}

/** Better Auth's `X-Retry-After`, in whole seconds, when it sent a usable one. */
function retryAfterOf(response: Response): number | null {
  const seconds = Number(response.headers.get("x-retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

/**
 * What went wrong. `what` names the action in the log line. Anything this does
 * not recognise is the service not working, and is logged, because this
 * application has no client error reporter yet and nothing else would record
 * it.
 */
export async function refusalOf(
  response: Response | null,
  what: string,
): Promise<Refusal> {
  if (response === null) return { failure: "unavailable", retryAfter: null };
  if (response.status === 429) {
    return { failure: "throttled", retryAfter: retryAfterOf(response) };
  }
  // A body that is not JSON is carried into the log below, not dropped.
  const body: unknown = await response.json().catch((error: unknown) => error);
  const code = codeOf(body);
  if (code && EXPIRED.has(code))
    return { failure: "expired", retryAfter: null };
  if (code && MISMATCH.has(code))
    return { failure: "mismatch", retryAfter: null };
  console.error(`${what} refused unexpectedly`, response.status, code ?? body);
  return { failure: "unavailable", retryAfter: null };
}

/**
 * The request, or null when there was no answer at all. Logged under `what`,
 * because this application has no client error reporter yet and the console is
 * the only place a request that never answered can be seen.
 */
export async function post(
  url: string,
  body: unknown,
  what: string,
): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`${what} request failed`, url, error);
    return null;
  }
}
