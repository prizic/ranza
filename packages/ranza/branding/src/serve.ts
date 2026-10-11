import type { StoredLogo } from "./contracts";

export interface LogoResponse {
  status: 200 | 304;
  headers: Record<string, string>;
  /** Absent on a 304. */
  body?: Uint8Array<ArrayBuffer>;
}

/**
 * How a logo is served, so the Portal and the Workspace say the same thing.
 *
 * The URL a page links to carries the logo's hash (`?v=…`), and a request that
 * names the current hash may be cached for good: the next change is a new URL,
 * which is what makes a new logo show on the next page load. A request that
 * names no hash, or an old one, is revalidated by its ETag instead, so a link
 * saved elsewhere never shows a stale logo for long.
 *
 * `private`, because these routes answer only to a signed-in viewer and a
 * shared cache must not hold one's answer for another. The headers stop an
 * image that is something else from being run as it: `nosniff`, and a policy
 * that allows it to load nothing.
 */
export function serveLogo(
  logo: StoredLogo,
  request: { version: string | null; ifNoneMatch: string | null },
): LogoResponse {
  const etag = `"${logo.hash}"`;
  const headers: Record<string, string> = {
    ETag: etag,
    "Cache-Control":
      request.version === logo.hash
        ? "private, max-age=31536000, immutable"
        : "private, no-cache",
    "Content-Security-Policy": "default-src 'none'",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.ifNoneMatch === etag) return { status: 304, headers };
  return {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": logo.contentType,
    },
    // Copied: the driver's buffer may be a view onto something shared, which a
    // response body may not be.
    body: new Uint8Array(logo.bytes),
  };
}
