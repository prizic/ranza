import { isSupportedLocale } from "@ranza/i18n";
import { NextResponse } from "next/server";

import { createControlPlaneClient } from "../../../../lib/supabase/server";

const INVITE_COOKIE = "ranza_platform_invite_token";
const INVITE_COOKIE_MAX_AGE_SECONDS = 10 * 60;

function secureRedirect(request: Request, pathname: string) {
  const response = NextResponse.redirect(new URL(pathname, request.url));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function inviteTokenFrom(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === INVITE_COOKIE) {
      try {
        const value = decodeURIComponent(valueParts.join("="));
        return value && value.length <= 2048 ? value : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function expireInviteCookie(response: NextResponse) {
  response.cookies.set(INVITE_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: true,
  });
  return response;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: requestedLocale } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "tr";
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const invalidPath = `/${locale}/sign-in?error=invalid-invite`;

  if (!tokenHash || type !== "invite") {
    return secureRedirect(request, invalidPath);
  }

  const response = secureRedirect(request, `/${locale}/auth/accept`);
  response.cookies.set(INVITE_COOKIE, tokenHash, {
    httpOnly: true,
    maxAge: INVITE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "strict",
    secure: true,
  });
  return response;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: requestedLocale } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "tr";
  const tokenHash = inviteTokenFrom(request);
  const invalidPath = `/${locale}/sign-in?error=invalid-invite`;
  if (!tokenHash) {
    return expireInviteCookie(secureRedirect(request, invalidPath));
  }

  const client = await createControlPlaneClient();
  const { error } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: "invite",
  });

  return expireInviteCookie(
    secureRedirect(
      request,
      error ? invalidPath : `/${locale}/set-password`,
    ),
  );
}
