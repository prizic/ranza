import { brandLogoResponse } from "../../../../../server/brand-logo";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
): Promise<Response> {
  const { organizationId } = await params;
  return brandLogoResponse(request, organizationId);
}
