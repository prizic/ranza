import { brandLogoResponse } from "../../../../../server/brand";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ stayId: string }> },
): Promise<Response> {
  const { stayId } = await params;
  return brandLogoResponse(request, stayId);
}
