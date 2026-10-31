"use server";

import { revalidatePath } from "next/cache";
import { isSupportedLocale } from "@ranza/i18n";
import { getComposition } from "./composition";
import { requireViewer } from "./viewer";

/**
 * Adding a payment plan to a booking that has none (PP-S3-02).
 *
 * The same funnel as every other write here (ADR 0007): the session is resolved
 * and the module asks. Who may make a plan, that the booking is a Resident's
 * with a departure date and not yet ended, that an instalment falls due within
 * the term, and that a booking has one plan at most, are the database's answers
 * and reach here as the module's named errors.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** What the dialog shows afterwards; every refusal says what to change. */
export type AddPaymentPlanOutcome =
  | "done"
  | "invalid"
  | "afterTerm"
  | "notAllowed"
  | "exists"
  | "refused"
  | "failed";

function named(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

export async function addPaymentPlan(
  locale: string,
  reservationId: string,
  amountsMinor: readonly number[],
  dueOns: readonly string[],
): Promise<AddPaymentPlanOutcome> {
  if (
    !isSupportedLocale(locale) ||
    !UUID.test(reservationId) ||
    amountsMinor.length !== dueOns.length ||
    !amountsMinor.every((amount) => Number.isSafeInteger(amount))
  ) {
    return "refused";
  }
  const viewer = await requireViewer(locale);

  try {
    await getComposition().paymentPlans.createPaymentPlan(
      viewer.userId,
      reservationId,
      amountsMinor.map((amountMinor, index) => ({
        amountMinor,
        dueOn: dueOns[index] ?? "",
      })),
    );
  } catch (error: unknown) {
    if (named(error, "PaymentPlanInputError")) return "invalid";
    if (named(error, "InstalmentAfterTermError")) return "afterTerm";
    if (named(error, "PaymentPlanNotAllowedError")) return "notAllowed";
    if (named(error, "PlanExistsError")) return "exists";
    if (named(error, "PaymentPlanRefusedError")) return "refused";
    console.error(
      "payment_plan.add_failed",
      { reservationId, userId: viewer.userId },
      error,
    );
    return "failed";
  }

  revalidatePath(`/${locale}/reservations`);
  return "done";
}
