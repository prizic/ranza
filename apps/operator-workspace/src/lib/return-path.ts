import { localizeHref, type SupportedLocale } from "@ranza/i18n";

/**
 * Where somebody was going when they were sent to sign in, so signing in can
 * take them there (SIGN-02).
 *
 * A path the sign-in page will redirect to is a path an attacker can put in a
 * link, so it is held to the narrowest thing that is still useful: a relative
 * path inside this application, in the language the sign-in page is in. Anything
 * else — another origin, a protocol-relative `//host`, a backslash a browser
 * reads as a slash, a path under no locale, or the sign-in page itself — is
 * dropped and the person lands on Today, as before.
 */

/** The query parameter the sign-in page reads the destination from. */
export const RETURN_PARAM = "next";

/** The request header the proxy writes the path and query being asked for into. */
export const LOCATION_HEADER = "x-ranza-location";

const LONGEST = 2000;

/** A line break, a tab or any other control character: never part of a path. */
function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

/**
 * `value` when it is a path under `locale` that a redirect may follow, else null.
 */
export function safeReturnPath(
  value: unknown,
  locale: SupportedLocale,
): string | null {
  if (typeof value !== "string" || value.length > LONGEST) return null;
  if (hasControlCharacter(value) || value.includes("\\")) return null;

  const prefix = `/${locale}`;
  const underLocale =
    value === prefix ||
    value.startsWith(`${prefix}/`) ||
    value.startsWith(`${prefix}?`);
  if (!underLocale) return null;

  // Resolved against a host nobody owns: whatever the string was, what comes
  // back must still be on that host, and still under the locale.
  const resolved = new URL(value, "http://return-path.invalid");
  if (resolved.origin !== "http://return-path.invalid") return null;
  if (!`${resolved.pathname}/`.startsWith(`${prefix}/`)) return null;
  if (`${resolved.pathname}/`.startsWith(`${prefix}/sign-in/`)) return null;

  return `${resolved.pathname}${resolved.search}`;
}

/** The sign-in page, asking to return to `here` — when `here` is a path it may. */
export function signInHref(
  locale: SupportedLocale,
  here: string | null | undefined,
): string {
  const signIn = localizeHref(locale, "sign-in");
  const destination = safeReturnPath(here, locale);
  return destination
    ? `${signIn}?${RETURN_PARAM}=${encodeURIComponent(destination)}`
    : signIn;
}
