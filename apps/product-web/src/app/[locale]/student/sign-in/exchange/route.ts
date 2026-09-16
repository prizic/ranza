import { randomUUID } from "node:crypto";
import { isSupportedLocale } from "@ranza/i18n";
import { parseServerEnvironment } from "@ranza/config";
import { exchangeStudentSignIn } from "../../../../../server/student-credential-gateway";
import { networkSignal } from "../../../../../server/student-credential-crypto";
import { readCredentialForm } from "../../../../../server/credential-request";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: rawLocale } = await params;
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  const environment = parseServerEnvironment(process.env);
  const form = await readCredentialForm(request);
  const correlationId = randomUUID();
  let result = { success: false, correlationId };
  try {
    if (form) {
      result = await exchangeStudentSignIn(
        {
          accessId: form.get("accessId") ?? "",
          pin: form.get("pin") ?? "",
          network: networkSignal(
            request.headers,
            environment.STUDENT_TRUSTED_IP_HEADER,
            environment.NODE_ENV === "production",
          ),
        },
        correlationId,
      );
    }
  } catch {
    // Keep malformed ingress signals indistinguishable from invalid credentials.
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: result.success
        ? `/${locale}/student`
        : `/${locale}/student/sign-in?error=invalid${result.correlationId ? `&ref=${encodeURIComponent(result.correlationId)}` : ""}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      ...(result.correlationId
        ? { "X-Correlation-ID": result.correlationId }
        : {}),
    },
  });
}
