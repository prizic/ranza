"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button, DialogSection } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import type { PaymentPlanView } from "../../../server/payment-plan";
import { AddPaymentPlanDialog } from "./add-payment-plan-dialog";
import { PaymentPlanSchedule } from "./payment-plan-schedule";

type Read =
  | { kind: "loading" }
  | { kind: "ready"; view: PaymentPlanView | null }
  | { kind: "failed" };

/** A booking that has not ended: the only kind the database lets take a plan. */
const LIVE_STATUSES = new Set(["requested", "confirmed", "checked_in"]);

/**
 * A Resident's instalments, on the booking (PP-S3-01, PP-S3-02).
 *
 * Read when the booking is opened, like the particulars and the Portal link
 * beside it, so the Reservations list never carries a schedule. A plan is shown
 * as it stands: what is paid, what is still to pay, and each instalment with
 * the day it falls due. A booking with none offers to add one where the desk is
 * already looking, prefilled from the price list.
 *
 * Nothing is drawn for a viewer who sees no plan and is offered none, because
 * an explanation of a screen they cannot use helps nobody. A booking that
 * cannot take a plan any more (ended, or nothing left to schedule) says so
 * rather than offering a button the database would refuse.
 */
export function PaymentPlanSection({
  endsOn,
  locale,
  propertyId,
  reservationId,
  startsOn,
  status,
  today,
  unitId,
}: {
  endsOn: string | null;
  locale: SupportedLocale;
  propertyId: string;
  reservationId: string;
  /** The first night of the term: the Stay's, once there is one. */
  startsOn: string;
  status: string;
  today: string | null | undefined;
  unitId: string;
}) {
  const t = useTranslations("paymentPlan");
  const [read, setRead] = useState<Read>({ kind: "loading" });
  const [adding, setAdding] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      try {
        const query = new URLSearchParams({
          reservation: reservationId,
          property: propertyId,
          unit: unitId,
        });
        const response = await fetch(
          `/api/front-office/payment-plan?${query.toString()}`,
          signal ? { signal } : {},
        );
        if (!response.ok) {
          throw Object.assign(new Error("payment plan could not be read"), {
            status: response.status,
          });
        }
        const body = (await response.json()) as {
          view?: PaymentPlanView | null;
        };
        setRead({ kind: "ready", view: body.view ?? null });
      } catch (error: unknown) {
        if (signal?.aborted) return;
        // The route has logged its half; this is the browser's.
        console.error("payment_plan.read_failed", { reservationId, error });
        setRead({ kind: "failed" });
      }
    },
    [propertyId, reservationId, unitId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setRead({ kind: "loading" });
    setAdding(false);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (read.kind === "loading") return null;

  if (read.kind === "failed") {
    return (
      <DialogSection title={t("title")}>
        <p className="m-0 text-sm text-muted-foreground" role="status">
          {t("readFailed")}
        </p>
      </DialogSection>
    );
  }

  const { view } = read;
  if (view === null || (view.plan === null && view.offer === null)) {
    return null;
  }

  if (view.plan !== null) {
    return (
      <DialogSection
        hint={t("count", { count: view.plan.instalments.length })}
        title={t("title")}
      >
        <PaymentPlanSchedule locale={locale} plan={view.plan} />
      </DialogSection>
    );
  }

  const { offer } = view;
  if (offer === null || !LIVE_STATUSES.has(status)) return null;

  // An instalment made now cannot fall before today, and one due on the
  // departure day or later charges for a term that is over.
  const from = today && today > startsOn ? today : startsOn;
  const hasTermLeft = endsOn !== null && from < endsOn;

  return (
    <DialogSection title={t("title")}>
      <p className="m-0 text-sm text-muted-foreground">
        {endsOn === null ? t("addNeedsDeparture") : t("empty")}
      </p>
      {hasTermLeft ? (
        <>
          <div>
            <Button
              onClick={() => setAdding(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" className="size-4" />
              {t("addPlan")}
            </Button>
          </div>
          <AddPaymentPlanDialog
            currency={offer.currency}
            from={from}
            locale={locale}
            nightlyRateMinor={view.nightlyRateMinor}
            onAdded={() => void load()}
            onOpenChange={setAdding}
            open={adding}
            reservationId={reservationId}
            to={endsOn}
          />
        </>
      ) : null}
    </DialogSection>
  );
}
