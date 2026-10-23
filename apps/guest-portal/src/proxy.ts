import { NextResponse, type NextRequest } from "next/server";
import { isSupportedLocale } from "@ranza/i18n";
import { LOCALE_COOKIE, negotiateLocale } from "./lib/negotiate-locale";

/**
 * Every Portal address names its language, and a link that does not (`/` or
 * `/stay`, as somebody types or bookmarks it) is sent to the language the
 * visitor last chose, or failing that the one their browser asks for.
 *
 * Reading a localized address remembers its language, so a guest who switches
 * to Arabic and later opens the bare link is not given Turkish again (GP-03).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const [, first = ""] = pathname.split("/");
  const remembered = request.cookies.get(LOCALE_COOKIE)?.value;

  if (isSupportedLocale(first)) {
    const response = NextResponse.next();
    if (remembered !== first) {
      response.cookies.set(LOCALE_COOKIE, first, {
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        sameSite: "lax",
      });
    }
    return response;
  }

  const locale = negotiateLocale(
    remembered,
    request.headers.get("accept-language"),
  );
  const target = request.nextUrl.clone();
  target.pathname =
    pathname === "/" ? `/${locale}/stay` : `/${locale}${pathname}`;
  return NextResponse.redirect(target);
}

export const config = {
  // Pages only: the auth route, Next's own files and anything with an
  // extension (the icons) are not language-prefixed and are left alone.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
