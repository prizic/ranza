import { isSupportedLocale } from "@ranza/i18n";
import { exchangeStudentSignIn } from "../../../../../server/student-credential-gateway";
import { networkSignal } from "../../../../../server/student-credential-crypto";
import { readCredentialForm } from "../../../../../server/credential-request";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: rawLocale } = await params;
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  const form = await readCredentialForm(request);
  const result = form
    ? await exchangeStudentSignIn({
        accessId: form.get("accessId") ?? "",
        pin: form.get("pin") ?? "",
        network: networkSignal(
          request.headers,
          process.env.STUDENT_TRUSTED_IP_HEADER,
        ),
      })
    : { success: false, correlationId: "" };
  return new Response(null, {
    status: 303,
    headers: {
      Location: result.success
        ? `/${locale}`
        : `/${locale}/student/sign-in?error=invalid`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      ...(result.correlationId
        ? { "X-Correlation-ID": result.correlationId }
        : {}),
    },
  });
}
