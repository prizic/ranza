const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface ExportDownloadPorts {
  authorize(exportId: string, operatorId: string): Promise<string | null>;
  sign(objectPath: string, seconds: number): Promise<string | null>;
}
export async function operatorExportDownload(
  exportId: string,
  operatorId: string,
  ports: ExportDownloadPorts,
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (!uuidPattern.test(exportId) || !uuidPattern.test(operatorId))
    return new Response("Not found", { status: 404, headers });
  try {
    const path = await ports.authorize(exportId, operatorId);
    if (path !== `${exportId.toLowerCase()}.json`)
      return new Response("Forbidden", { status: 403, headers });
    const signedUrl = await ports.sign(path, 60);
    if (!signedUrl) return new Response("Forbidden", { status: 403, headers });
    return new Response(null, {
      status: 303,
      headers: { ...headers, Location: signedUrl },
    });
  } catch {
    return new Response("Forbidden", { status: 403, headers });
  }
}
