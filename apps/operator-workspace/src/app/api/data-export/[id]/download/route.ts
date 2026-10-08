import { getComposition } from "../../../../../server/composition";
import { currentViewer } from "../../../../../server/viewer";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const comp = getComposition();
    const exportRecord = await comp.dataExport.getExport(viewer.userId, id);

    if (
      !exportRecord ||
      exportRecord.status !== "ready" ||
      !exportRecord.fileContent
    ) {
      return new Response(null, { status: 404 });
    }

    const contentType =
      exportRecord.format === "json"
        ? "application/json; charset=utf-8"
        : "text/csv; charset=utf-8";

    const fileName =
      exportRecord.fileName ||
      `export-${exportRecord.id.slice(0, 8)}.${exportRecord.format}`;

    return new Response(exportRecord.fileContent, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch {
    return new Response(null, { status: 500 });
  }
}
