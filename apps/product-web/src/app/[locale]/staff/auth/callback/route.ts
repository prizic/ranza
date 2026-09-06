import { isSupportedLocale } from "@ranza/i18n";
import { type NextRequest, NextResponse } from "next/server";

import { createProductWebClient } from "../../../../../lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: requestedLocale } = await params;
  const locale = isSupportedLocale(requestedLocale) ? requestedLocale : "tr";
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL(`/${locale}/staff/sign-in?error=missing-code`, request.url),
    );
  }

  const client = await createProductWebClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(
    new URL(
      error
        ? `/${locale}/staff/sign-in?error=invalid-code`
        : `/${locale}/staff`,
      request.url,
    ),
  );
}
