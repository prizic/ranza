"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import {
  ArrowButton,
  CancelButton,
  Dialog,
  DialogActions,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  dialogFrameClassName,
  FormError,
  SuggestionRow,
  Textarea,
  textareaClassName,
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

  const cancelling = kind === "cancel";
  const needsReason = cancelling && reason.trim().length < REASON.min;

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className={dialogFrameClassName("small")}>
        <form action={act} className="grid">
          <DialogMasthead
            art={`/illustrations/dialogs/${cancelling ? "cancel-booking" : "no-show"}.svg`}
            eyebrow={cancelling ? t("cancelBookingTitle") : t("noShowTitle")}
            facts={`${reference} · ${t("roomWord")} ${unitLabel}`}
            heading={guestName}
          />

          <DialogBody simple>
            <DialogDescription className="sr-only">
              {cancelling ? t("cancelBookingSummary") : t("noShowSummary")}
            </DialogDescription>

            <DialogNotice icon={Info}>
              {cancelling ? t("cancelBookingSummary") : t("noShowSummary")}
            </DialogNotice>

            <input name="reservation" type="hidden" value={reservationId} />
            <input name="locale" type="hidden" value={locale} />

            {!cancelling && expected ? (
              <p className="m-0 text-step--1 font-medium">
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

            {cancelling ? (
              <DialogSection
                hint={t("endBookingReasonHint")}
                labelFor={`cancel-${reservationId}`}
                tag={{ label: t("dialogTagRequired"), required: true }}
                title={t("reason")}
              >
                <Textarea
                  autoFocus
                  className={textareaClassName}
                  aria-describedby={`cancel-${reservationId}-hint`}
                  id={`cancel-${reservationId}`}
                  maxLength={REASON.max}
                  minLength={REASON.min}
                  name="reason"
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t("cancelReasonExample")}
                  required
                  rows={3}
                  value={reason}
                />
                <SuggestionRow
                  items={PRESET_REASONS.map((preset) => t(preset))}
                  label={t("dialogQuickPicks")}
                  onPick={setReason}
                />
              </DialogSection>
            ) : null}

            {message ? (
              <div aria-live="polite">
                <FormError>{message}</FormError>
              </div>
            ) : null}
          </DialogBody>

          <DialogActions hint={needsReason ? t("dialogHintReason") : null}>
            <DialogClose asChild>
              <CancelButton type="button">{t("keepBooking")}</CancelButton>
            </DialogClose>
            <ArrowButton
              disabled={pending || needsReason}
              tone="danger"
              type="submit"
            >
              {pending
                ? t("saving")
                : cancelling
                  ? t("cancelBooking")
                  : t("markNoShow")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
