import "server-only";
import type { PaymentPlan } from "@ranza/payment-plans";
import { getComposition } from "./composition";
import { bookableUnits, currentViewer } from "./viewer";

/**
 * What the booking's payment plan section needs, read when the desk opens the
 * booking (PP-S3-01, PP-S3-02), so the Reservations list never carries it.
 *
 * `plan` is the schedule with where each instalment stands, or null for none
 * and for one out of the viewer's reach. `offer` is the currency a plan would
 * be made in, null when this viewer is not offered one here. `nightlyRateMinor`
 * is the price list's night for the booking's Unit, which a plan made later is
 * prefilled from; null when it has none.
 */
export interface PaymentPlanView {
  plan: PaymentPlan | null;
  offer: { currency: string } | null;
  nightlyRateMinor: number | null;
}

export async function paymentPlanView(
  reservationId: string,
  propertyId: string,
  unitId: string,
): Promise<PaymentPlanView | null> {
  const viewer = await currentViewer();
  if (!viewer) return null;
  const { paymentPlans } = getComposition();
  const [plan, offer, units] = await Promise.all([
    paymentPlans.readPaymentPlan(viewer.userId, reservationId),
    paymentPlans.planOffer(viewer.userId, propertyId),
    bookableUnits(propertyId),
  ]);
  const unit = units.find((candidate) => candidate.unitId === unitId);
  // A rate in another currency would put the wrong figure under the plan's.
  const nightlyRateMinor =
    offer !== null && unit?.rateCurrency === offer.currency
      ? (unit.nightlyRateMinor ?? null)
      : null;
  return { plan, offer, nightlyRateMinor };
}
