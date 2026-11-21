import { isSupportedLocale } from "@ranza/i18n";
import { importResultFile } from "../../../../../server/import-files";
import { currentViewer } from "../../../../../server/viewer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * What an import came to, as a workbook: every row with its outcome, or only
 * the rows to fix in the template's own columns so the file is corrected and
 * uploaded again (IMP-S1-25).
 *
 * To the uploader and nobody else: the rows come back empty for anybody the
 * database does not let read them (IMP-S1-04), and an import with no rows to
 * give is the same bodiless 404 as one that never existed.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale");
  const which = searchParams.get("file");
  if (
    !UUID.test(id) ||
    !locale ||
    !isSupportedLocale(locale) ||
    (which !== "result" && which !== "fix")
  ) {
    return new Response(null, { status: 404 });
  }

  try {
    const file = await importResultFile(viewer.userId, id, which, locale);
    if (!file) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${
          which === "fix" ? "rows-to-fix.xlsx" : "import-result.xlsx"
        }"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    console.error("import.result_failed", {
      importId: id,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
