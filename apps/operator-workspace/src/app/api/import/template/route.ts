import { isSupportedLocale } from "@ranza/i18n";
import { roomTemplate } from "../../../../server/import-files";
import { currentViewer } from "../../../../server/viewer";

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const FILE_NAMES = {
  en: "rooms-template.xlsx",
  tr: "odalar-sablonu.xlsx",
  ar: "rooms-template.xlsx",
} as const;

/**
 * The rooms template: the headings in the reader's language and one example
 * row (IMP-S1-26). It holds nothing of anybody's, so being signed in is all it
 * asks.
 */
export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale");
  if (
    searchParams.get("kind") !== "rooms" ||
    !locale ||
    !isSupportedLocale(locale)
  ) {
    return new Response(null, { status: 404 });
  }

  try {
    const file = await roomTemplate(locale);
    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${FILE_NAMES[locale]}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    console.error("import.template_failed", { userId: viewer.userId, error });
    return new Response(null, { status: 500 });
  }
}
