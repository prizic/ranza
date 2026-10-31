/**
 * The two things the Portal's forms need to talk to the auth route: a POST that
 * says when nobody answered, and the code Better Auth puts on a refusal.
 */

export function codeOf(body: unknown): string | undefined {
  return typeof body === "object" &&
    body !== null &&
    "code" in body &&
    typeof body.code === "string"
    ? body.code
    : undefined;
}

/**
 * The request, or null when there was no answer at all. Logged, because this
 * application has no client error reporter yet and the console is the only
 * place a request that never answered can be seen; the form says it is not
 * working.
 */
export async function post(
  url: string,
  body: unknown,
): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("sign-in request failed", url, error);
    return null;
  }
}
