import { parsePublicEnvironment } from "@ranza/config";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/")
    return NextResponse.redirect(new URL("/tr", request.url));

  return refreshProductWebSession(request);
}

export async function refreshProductWebSession(
  request: NextRequest,
  createClient: typeof createServerClient = createServerClient,
) {
  const environment = parsePublicEnvironment(process.env);
  if (
    !environment.NEXT_PUBLIC_SUPABASE_URL ||
    !environment.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const setAll: SetAllCookies = (values, headers) => {
    for (const { name, value } of values) request.cookies.set(name, value);
    response = NextResponse.next({ request });
    for (const { name, options, value } of values)
      response.cookies.set(name, value, options);
    for (const [name, value] of Object.entries(headers))
      response.headers.set(name, value);
  };
  const supabase = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll: () => request.cookies.getAll(), setAll } },
  );
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|pwa/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
