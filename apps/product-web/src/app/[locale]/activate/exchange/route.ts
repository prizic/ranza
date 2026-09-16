import { isSupportedLocale } from "@ranza/i18n";
import { parseServerEnvironment } from "@ranza/config";
import { exchangeStudentActivation } from "../../../../server/student-credential-gateway";
import { networkSignal } from "../../../../server/student-credential-crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: rawLocale } = await params;
  const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
  const url = new URL(request.url);
  const recovery = url.searchParams.get("mode") === "recovery";
  const finish = (result: { correlationId?: string; success: boolean }) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `/${locale}/activate?${
          result.success
            ? recovery
              ? "recovered=1"
              : "activated=1"
            : `${recovery ? "mode=recovery&" : ""}error=invalid${result.correlationId ? `&ref=${encodeURIComponent(result.correlationId)}` : ""}`
        }`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        ...(result.correlationId
          ? { "X-Correlation-ID": result.correlationId }
          : {}),
      },
    });
  const environment = parseServerEnvironment(process.env);
  const origin =
    environment.PRODUCT_WEB_ORIGIN ??
    (environment.NODE_ENV !== "production" ? url.origin : null);
  if (
    !origin ||
    request.headers.get("origin") !== origin ||
    !request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return finish({ success: false });
  // Enforce a body limit even when Content-Length is missing or dishonest.
  const reader = request.body?.getReader();
  if (!reader) return finish({ success: false });
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
        return finish({ success: false });
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
          environment.STUDENT_TRUSTED_IP_HEADER,
          environment.NODE_ENV === "production",
        ),
      }),
    );
  } catch {
    return finish({ success: false });
  }
}
