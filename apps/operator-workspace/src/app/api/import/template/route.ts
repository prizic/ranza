import { isSupportedLocale } from "@ranza/i18n";
import { importTemplate, isImportKind } from "../../../../server/import-files";
import { currentViewer } from "../../../../server/viewer";

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const FILE_NAMES = {
  rooms: {
    en: "rooms-template.xlsx",
    tr: "odalar-sablonu.xlsx",
    ar: "rooms-template.xlsx",
  },
  people: {
    en: "people-template.xlsx",
    tr: "kisiler-sablonu.xlsx",
    ar: "people-template.xlsx",
  },
} as const;

/**
 * A kind's template: the headings in the reader's language and one example
 * row (IMP-S1-26, IMP-S2-06). It holds nothing of anybody's, so being signed in is all it
 * asks.
 */
export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const locale = searchParams.get("locale");
  if (!isImportKind(kind) || !locale || !isSupportedLocale(locale)) {
    return new Response(null, { status: 404 });
  }

  try {
    const file = await importTemplate(kind, locale);
    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${FILE_NAMES[kind][locale]}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    console.error("import.template_failed", {
      userId: viewer.userId,
      kind,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
