import { isSupportedLocale } from "@ranza/i18n";
import { NextResponse } from "next/server";

import { createControlPlaneClient } from "../../../../lib/supabase/server";

const TOKEN_COOKIE = "__Host-ranza_platform_setup_token";
const TYPE_COOKIE = "__Host-ranza_platform_setup_type";
const SETUP_COOKIE_MAX_AGE_SECONDS = 10 * 60;
type SetupOtpType = "invite" | "recovery";

function secureRedirect(request: Request, pathname: string) {
  const response = NextResponse.redirect(new URL(pathname, request.url));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

function cookieValue(request: Request, cookieName: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === cookieName) {
      try {
        return decodeURIComponent(valueParts.join("=")) || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function setupCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/" as const,
    sameSite: "strict" as const,
    secure: true,
  };
}

function expireSetupCookies(response: NextResponse) {
  response.cookies.set(TOKEN_COOKIE, "", setupCookieOptions(0));
  response.cookies.set(TYPE_COOKIE, "", setupCookieOptions(0));
  return response;
}

function isSetupType(value: string | null): value is SetupOtpType {
  return value === "invite" || value === "recovery";
}

function isTokenHash(value: string | null): value is string {
  // GoTrue OTP hashes are SHA-224 (56 hex); 64 tolerated if that changes.
  return Boolean(value && /^[a-f0-9]{56,64}$/i.test(value));
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

  if (!isTokenHash(tokenHash) || !isSetupType(type)) {
    return expireSetupCookies(secureRedirect(request, invalidPath));
  }

  const acceptPath = `/${locale}/auth/accept${
    type === "recovery" ? "?type=recovery" : ""
  }`;
  const response = secureRedirect(request, acceptPath);
  response.cookies.set(
    TOKEN_COOKIE,
    tokenHash,
    setupCookieOptions(SETUP_COOKIE_MAX_AGE_SECONDS),
  );
  response.cookies.set(
    TYPE_COOKIE,
    type,
    setupCookieOptions(SETUP_COOKIE_MAX_AGE_SECONDS),
  );
  return response;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: requestedLocale } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "tr";
  const tokenHash = cookieValue(request, TOKEN_COOKIE);
  const type = cookieValue(request, TYPE_COOKIE);
  const invalidPath = `/${locale}/sign-in?error=invalid-invite`;
  const expectedOrigin = new URL(request.url).origin;
  if (
    request.headers.get("origin") !== expectedOrigin ||
    !isTokenHash(tokenHash) ||
    !isSetupType(type)
  ) {
    return expireSetupCookies(secureRedirect(request, invalidPath));
  }

  const client = await createControlPlaneClient();
  const { error } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  return expireSetupCookies(
    secureRedirect(request, error ? invalidPath : `/${locale}/set-password`),
  );
}
