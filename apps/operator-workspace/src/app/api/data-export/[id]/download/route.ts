import { getComposition } from "../../../../../server/composition";
import { currentViewer } from "../../../../../server/viewer";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A ready export's file, to the person the database lets have it and nobody
 * else (ADR 0043). Everything that decides that is in
 * `app.read_data_export_file()`: whose it is, whether it has expired, and what
 * the downloader may still read. An export that is not theirs, has not
 * finished, has expired or never existed is the same bodiless 404, so the route
 * is no way to learn which exports exist.
 *
 * Every download that happens is recorded in the audit log in the transaction
 * that fetched the file, so none leaves without a record.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) {
    return new Response(null, { status: 401 });
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return new Response(null, { status: 404 });
  }

  try {
    const file = await getComposition().dataExport.downloadExport(
      viewer.userId,
      id,
    );
    if (!file) return new Response(null, { status: 404 });

    return new Response(file.content, {
      status: 200,
      headers: {
        "Content-Type":
          file.format === "json"
            ? "application/json; charset=utf-8"
            : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        // A file of somebody's data is a download and never a page.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    console.error("data_export.download_failed", {
      exportId: id,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
