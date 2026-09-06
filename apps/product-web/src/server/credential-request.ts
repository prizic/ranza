// Accept only bounded same-origin HTML form posts. Credentials never enter URLs.
export async function readCredentialForm(
  request: Request,
): Promise<URLSearchParams | null> {
  const origin =
    process.env.PRODUCT_WEB_ORIGIN ??
    (process.env.NODE_ENV !== "production"
      ? new URL(request.url).origin
      : null);
  if (
    !origin ||
    request.headers.get("origin") !== origin ||
    !request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
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
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return new URLSearchParams(text + decoder.decode());
  } catch {
    return null;
  }
}
