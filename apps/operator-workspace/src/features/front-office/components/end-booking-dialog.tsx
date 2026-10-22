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
  DialogTicket,
  Field,
  FormError,
  Textarea,
  ticketBodyClassName,
  ticketDialogClassName,
  ticketFooterClassName,
} from "@ranza/ui";
import {
  cancelBooking,
  markNoShow,
  type EndBookingOutcome,
} from "../../../server/front-office";
import { refusalMessage } from "../refusal";

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

const PRESET_REASONS = [
  "cancelReasonGuest",
  "cancelReasonUnconfirmed",
  "cancelReasonError",
  "cancelReasonDuplicate",
  "cancelReasonRoom",
] as const;

export function EndBookingDialog({
  expected,
  guestName,
  kind,
  locale,
  onOpenChange,
  open,
  reference,
  reservationId,
  unitLabel,
}: {
  /**
   * What the booking said about the Guest's arrival, for a no-show: the time,
   * and whether the Property's clock has passed it (null when the screen does
   * not know). Said before the red button, because a no-show cannot be taken
   * back and the desk should see how early it is.
   */
  expected?: { time: string; passed: boolean | null } | null | undefined;
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

  const refusal = refusalMessage(outcome);
  const message =
    outcome === "reasonTooShort"
      ? t("reasonTooShort", { min: REASON.min })
      : outcome === "reasonTooLong"
        ? t("reasonTooLong", { max: REASON.max })
        : refusal
          ? t(refusal)
          : null;

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className={ticketDialogClassName}>
        <form action={act} className="grid">
          <DialogTicket
            art={`/illustrations/dialogs/${kind === "cancel" ? "cancel-booking" : "no-show"}.svg`}
            eyebrow={
              kind === "cancel" ? t("cancelBookingTitle") : t("noShowTitle")
            }
            heading={guestName}
            stub={[
              {
                label: t("reservation"),
                value: <span className="font-mono">{reference}</span>,
              },
              { label: t("unit"), value: <bdi>{unitLabel}</bdi> },
            ]}
          />

          <div className={ticketBodyClassName}>
            <DialogDescription>
              {kind === "cancel"
                ? t("cancelBookingSummary")
                : t("noShowSummary")}
            </DialogDescription>

            <input name="reservation" type="hidden" value={reservationId} />
            <input name="locale" type="hidden" value={locale} />

            {kind === "no_show" && expected ? (
              <p className="text-step--1 font-medium">
                {t(
                  expected.passed === true
                    ? "noShowExpectedPassed"
                    : expected.passed === false
                      ? "noShowExpectedPending"
                      : "noShowExpectedGiven",
                  { time: expected.time },
                )}
              </p>
            ) : null}

            {kind === "cancel" ? (
              <div className="grid gap-2">
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
                {/* The reasons a desk gives most, one press to fill the box. */}
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_REASONS.map((preset) => (
                    <Button
                      key={preset}
                      onClick={() => setReason(t(preset))}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t(preset)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {message ? (
              <div aria-live="polite">
                <FormError>{message}</FormError>
              </div>
            ) : null}
          </div>

          <DialogFooter className={ticketFooterClassName}>
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
