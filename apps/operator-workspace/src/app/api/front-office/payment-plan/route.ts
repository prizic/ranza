import { currentViewer } from "../../../../server/viewer";
import { paymentPlanView } from "../../../../server/payment-plan";

/**
 * A booking's payment plan and whether one may be added, read when the desk
 * opens the booking (PP-S3-01), so the Reservations list never carries it.
 *
 * The same narrow entrance as the other front-office routes: this file calls
 * `src/server/` and nothing else, and nothing here decides who may see a plan
 * or make one. A failed read is logged with the booking and the viewer.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const viewer = await currentViewer();
  if (!viewer) return new Response(null, { status: 401 });

  const params = new URL(request.url).searchParams;
  const reservation = params.get("reservation") ?? "";
  const property = params.get("property") ?? "";
  const unit = params.get("unit") ?? "";
  if (![reservation, property, unit].every((id) => UUID.test(id))) {
    return Response.json({ view: null });
  }

  try {
    const view = await paymentPlanView(reservation, property, unit);
    return Response.json(
      { view },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("payment_plan.read_failed", {
      reservationId: reservation,
      userId: viewer.userId,
      error,
    });
    return new Response(null, { status: 500 });
  }
}
