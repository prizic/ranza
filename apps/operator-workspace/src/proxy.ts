import { NextResponse, type NextRequest } from "next/server";
import { isSupportedLocale } from "@ranza/i18n";
import { LOCALE_COOKIE, openingLocale } from "./lib/locale-choice";
import { LOCATION_HEADER } from "./lib/return-path";

/**
 * Two things a page cannot do for itself.
 *
 * It tells the pages where the request was going, because a server component
 * is not handed its own path: a signed-out visitor who opened a deep link is
 * sent to sign in with that link as `?next=`, and arrives where they were
 * going (SIGN-02). The header is set on every request this runs for, so one
 * a client sent is overwritten, and it is only ever read as a candidate
 * path that `safeReturnPath` still has to accept.
 *
 * And it remembers the language: every localized request sets a cookie, and the
 * bare address opens in that language, then the browser's, then Turkish
 * (SIGN-03).
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === "/") {
    const locale = openingLocale(
      request.cookies.get(LOCALE_COOKIE)?.value,
      request.headers.get("accept-language"),
    );
    return NextResponse.redirect(new URL(`/${locale}/today`, request.url));
  }

  const query = new URLSearchParams(searchParams);
  // The router's own marker on a client navigation, which is not part of where
  // the person was going.
  query.delete("_rsc");
  const search = query.size > 0 ? `?${query.toString()}` : "";

  const headers = new Headers(request.headers);
  headers.set(LOCATION_HEADER, `${pathname}${search}`);
  const response = NextResponse.next({ request: { headers } });

  const locale = pathname.split("/")[1];
  if (isSupportedLocale(locale)) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }
  return response;
}

export const config = {
  matcher: ["/", "/(tr|en|ar)/:path*"],
};
