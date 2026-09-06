import { resolvePublicWifi } from "../../../server/public-wifi";
import { readCredentialForm } from "../../../server/credential-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, noarchive",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  const form = await readCredentialForm(request);
  const trustedHeader = process.env.PUBLIC_WIFI_TRUSTED_IP_HEADER;
  const network = trustedHeader
    ? (request.headers.get(trustedHeader) ?? "shared")
    : "shared";
  const details = form
    ? await resolvePublicWifi(form.get("token") ?? "", network)
    : null;
  return Response.json(details ?? { error: "unavailable" }, {
    status: details ? 200 : 404,
    headers,
  });
}
