import { isSupportedLocale } from "@ranza/i18n";
import { createProductWebClient } from "../../../../lib/supabase/server";
import { readCredentialForm } from "../../../../server/credential-request";
import { studentCredentialCopy } from "../../../../lib/student-credential-copy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: rawLocale } = await params;
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  if (!(await readCredentialForm(request)))
    return new Response(null, { status: 403 });
  try {
    const client = await createProductWebClient();
    const revoked = await client.rpc("sign_out_student_session");
    if (revoked.error || revoked.data !== true)
      return new Response(studentCredentialCopy[locale].signOutError, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    await client.auth.signOut({ scope: "local" });
  } catch {
    return new Response(studentCredentialCopy[locale].signOutError, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/${locale}/student/sign-in`,
      "Cache-Control": "no-store",
      "Clear-Site-Data": '"cache"',
    },
  });
}
