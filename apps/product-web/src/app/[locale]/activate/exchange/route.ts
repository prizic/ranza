import { isSupportedLocale } from "@ranza/i18n";
import { exchangeStudentActivation } from "../../../../server/student-credential-gateway";
import { networkSignal } from "../../../../server/student-credential-crypto";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: rawLocale } = await params;
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  const url = new URL(request.url);
  const finish = (success: boolean) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `/${locale}/activate?${success ? "activated=1" : "error=invalid"}`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  const origin =
    process.env.PRODUCT_WEB_ORIGIN ??
    (process.env.NODE_ENV !== "production" ? url.origin : null);
  if (
    !origin ||
    request.headers.get("origin") !== origin ||
    !request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return finish(false);
  // Enforce a body limit even when Content-Length is missing or dishonest.
  const reader = request.body?.getReader();
  if (!reader) return finish(false);
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2048) {
        await reader.cancel();
        return finish(false);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const form = new URLSearchParams(text);
    return finish(
      await exchangeStudentActivation({
        accessId: form.get("accessId") ?? "",
        code: form.get("code") ?? "",
        pin: form.get("pin") ?? "",
        network: networkSignal(
          request.headers,
          process.env.STUDENT_TRUSTED_IP_HEADER,
        ),
      }),
    );
  } catch {
    return finish(false);
  }
}
