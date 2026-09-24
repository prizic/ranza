"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Fact,
  FactList,
  Field,
  FormError,
  Textarea,
} from "@ranza/ui";
import {
  cancelBooking,
  markNoShow,
  type EndBookingOutcome,
} from "../../../server/front-office";

/**
 * Ending a booking that will never become a Stay: cancelled, or a no-show.
 *
 * Controlled rather than owning a trigger, because the row menu opens it and a
 * dropdown item cannot host a dialog without the menu closing it again.
 *
 * A cancellation asks for a reason and a no-show does not — the status is its
 * reason (blueprint 4.4 leaves the choice to the command). Both free the nights
 * and neither can be taken back, which is why each is confirmed rather than a
 * single press on a menu item.
 *
 * `REASON` restates `CANCELLATION_REASON` for the reason `undo-check-in-dialog.tsx`
 * gives: a value import from the module's entry point pulls Prisma into the
 * browser bundle.
 */
const REASON = { min: 3, max: 2000 };

export type EndBookingKind = "cancel" | "no_show";

export function EndBookingDialog({
  guestName,
  kind,
  locale,
  onOpenChange,
  open,
  reference,
  reservationId,
  unitLabel,
}: {
  guestName: string;
  kind: EndBookingKind;
  locale: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  reference: string;
  reservationId: string;
  unitLabel: string;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  const [outcome, act, pending] = useActionState<EndBookingOutcome, FormData>(
    kind === "cancel" ? cancelBooking : markNoShow,
    "idle",
  );

  // Done is the one outcome the row may survive — a cancelled booking stays on
  // the Reservations list with its new status — so the dialog closes itself.
  useEffect(() => {
    if (outcome === "done") onOpenChange(false);
  }, [outcome, onOpenChange]);

  const message =
    outcome === "reasonTooShort"
      ? t("reasonTooShort", { min: REASON.min })
      : outcome === "reasonTooLong"
        ? t("reasonTooLong", { max: REASON.max })
        : outcome === "refused"
          ? t("endBookingRefused")
          : null;

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent>
        <form action={act} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {kind === "cancel" ? t("cancelBookingTitle") : t("noShowTitle")}
            </DialogTitle>
            <DialogDescription>
              {kind === "cancel"
                ? t("cancelBookingSummary")
                : t("noShowSummary")}
            </DialogDescription>
          </DialogHeader>

          <FactList className="gap-4 pt-0">
            <Fact label={t("guest")}>
              <bdi>{guestName}</bdi>
            </Fact>
            <Fact label={t("reservation")}>
              <span className="font-mono tabular-nums">{reference}</span>
            </Fact>
            <Fact label={t("unit")}>
              <bdi className="tabular-nums">{unitLabel}</bdi>
            </Fact>
          </FactList>

          <input name="reservation" type="hidden" value={reservationId} />
          <input name="locale" type="hidden" value={locale} />

          {kind === "cancel" ? (
            <Field htmlFor={`cancel-${reservationId}`} label={t("reason")}>
              <Textarea
                autoFocus
                id={`cancel-${reservationId}`}
                maxLength={REASON.max}
                minLength={REASON.min}
                name="reason"
                onChange={(event) => setReason(event.target.value)}
                required
                rows={3}
                value={reason}
              />
            </Field>
          ) : null}

          {message ? (
            <div aria-live="polite">
              <FormError>{message}</FormError>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("keepBooking")}
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit" variant="destructive">
              {pending
                ? t("saving")
                : kind === "cancel"
                  ? t("cancelBooking")
                  : t("markNoShow")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
