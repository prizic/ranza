"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatMoney, type SupportedLocale } from "@ranza/i18n";
import {
  ArrowButton,
  CancelButton,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  dialogFrameClassName,
  FormError,
} from "@ranza/ui";
import {
  addPaymentPlan,
  type AddPaymentPlanOutcome,
} from "../../../server/payment-plan-actions";
import { usePaymentPlan } from "../use-payment-plan";
import { PaymentPlanFields } from "./payment-plan-fields";

const OUTCOME_MESSAGE = {
  invalid: "paymentPlan.invalid",
  afterTerm: "paymentPlan.afterTerm",
  notAllowed: "paymentPlan.notAllowed",
  exists: "paymentPlan.alreadyPlanned",
  refused: "refusalUnreachable",
  failed: "refusalFailed",
} as const satisfies Record<Exclude<AddPaymentPlanOutcome, "done">, string>;

/**
 * Adding a payment plan to a booking that has none (PP-S3-02).
 *
 * The same section the registration dialog shows, opened at once and prefilled
 * from the price list, because the gesture ("add one") carries everything but
 * the amounts and days, which are the desk's to settle. The plan starts today
 * for a term that began already: an instalment due in the past would be charged
 * the moment the worker next ran, and the desk can still pick any day.
 *
 * Nothing here decides who may make a plan or whether this booking may take
 * one; the database does, and a refusal says what to change.
 */
export function AddPaymentPlanDialog({
  currency,
  from,
  locale,
  nightlyRateMinor,
  onAdded,
  onOpenChange,
  open,
  reservationId,
  to,
}: {
  currency: string;
  /** The first day an instalment may be suggested for: arrival, or today if later. */
  from: string;
  locale: SupportedLocale;
  nightlyRateMinor: number | null;
  onAdded: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  reservationId: string;
  to: string;
}) {
  const t = useTranslations();
  const plan = usePaymentPlan({
    currency,
    from,
    nightlyRateMinor,
    offered: true,
    openByDefault: true,
    resident: true,
    to,
  });
  const [outcome, setOutcome] = useState<AddPaymentPlanOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = plan.problem === null && plan.submitted.length > 0;
  const message =
    outcome === null || outcome === "done" ? null : t(OUTCOME_MESSAGE[outcome]);

  function close(next: boolean) {
    if (!next) {
      plan.reset();
      setOutcome(null);
    }
    onOpenChange(next);
  }

  function submit() {
    startTransition(async () => {
      const result = await addPaymentPlan(
        locale,
        reservationId,
        plan.submitted,
        plan.rows.map((row) => row.dueOn),
      );
      setOutcome(result);
      if (result === "done") {
        close(false);
        onAdded();
      }
    });
  }

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent className={dialogFrameClassName("small")}>
        <form
          className="grid"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !pending) submit();
          }}
        >
          <DialogMasthead
            art="/illustrations/dialogs/new-booking.svg"
            eyebrow={t("paymentPlan.title")}
            heading={t("paymentPlan.addTitle")}
          />
          <DialogBody simple>
            <DialogDescription className="sr-only">
              {t("paymentPlan.addSummary")}
            </DialogDescription>
            <PaymentPlanFields
              canRemove={false}
              currency={currency}
              from={from}
              locale={locale}
              plan={plan}
              to={to}
            />
            {message ? (
              <div aria-live="polite">
                <FormError>{message}</FormError>
              </div>
            ) : null}
          </DialogBody>
          <DialogActions
            hint={
              ready ? (
                <p
                  aria-live="polite"
                  className="m-0 text-sm font-medium text-foreground"
                >
                  <bdi>
                    {t("paymentPlan.summary", {
                      count: plan.rows.length,
                      sum: formatMoney(plan.sumMinor, currency, locale),
                    })}
                  </bdi>
                </p>
              ) : null
            }
          >
            <CancelButton onClick={() => close(false)} type="button">
              {t("notNow")}
            </CancelButton>
            <ArrowButton disabled={pending || !ready} type="submit">
              {pending ? t("saving") : t("paymentPlan.save")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
