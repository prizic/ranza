/**
 * Where this Portal is served, as a browser names it in `Origin`.
 *
 * Behind the proxy a request's own URL names the container it reached
 * (`http://0.0.0.0:3001`), never the address the student opened, so the
 * configured one — the address Better Auth already checks its own requests
 * against — is the answer. Without one, on a developer's machine where nothing
 * stands in between, the request's own URL is.
 */
export function siteOrigin(request: Request): string {
  const configured = process.env.BETTER_AUTH_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch (error: unknown) {
      console.error("BETTER_AUTH_URL is not an address", { configured }, error);
    }
  }
  return new URL(request.url).origin;
}
