"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarCheck, TriangleAlert } from "lucide-react";
import {
  ArrowButton,
  Button,
  CancelButton,
  Dialog,
  DialogActions,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFacts,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  DialogSettled,
  dialogFrameClassName,
  DialogTrigger,
  FormError,
  Textarea,
  textareaClassName,
} from "@ranza/ui";
import {
  closeBusinessDay,
  closeWaitingDays,
  type CloseDayOutcome,
} from "../../../server/close-day";

/**
 * `CLOSE_REASON` in `@ranza/business-day`, restated rather than imported for
 * the reason `undo-check-in-dialog.tsx` gives: that entry point also exports
 * the module factory, and a value import from a client component would put
 * Prisma in the browser bundle.
 */
const REASON = { min: 3, max: 2000 };

/**
 * Closing the day that is waiting (ADR 0034).
 *
 * A dialog even when nothing is open: a close cannot be reopened yet, and the
 * one thing worth a second look before pressing is the date. With items open
 * it asks for a reason, because the close records them as left open and the
 * reason is what explains why the day closed anyway.
 *
 * It closes by being taken away. A close revalidates the screen, the next day
 * becomes the one waiting, and the dialog is re-keyed on it. A refusal that
 * means the day moved on — closed elsewhere, or no longer the one waiting — is
 * shown here first, and the screen is refreshed when the dialog is dismissed,
 * so the message is read before the day it is about is gone.
 *
 * The form, and the outcome it holds, live inside the dialog's content, which
 * is unmounted when the dialog closes: every opening starts clean, and a
 * refusal from the last attempt is never shown before the next one is made.
 */
export function CloseDayDialog(props: CloseDayFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const label = props.all
    ? t("closeDay.closeAll", { n: props.all.count })
    : props.alongsideAll
      ? t("closeDay.closeOnly", { date: props.dayLabel })
      : t("closeDay.close", { date: props.dayLabel });

  return (
    <Dialog
      onOpenChange={(open) => {
        // Whatever happened inside, the screen may be stale once it closes.
        if (!open) router.refresh();
      }}
    >
      <DialogTrigger asChild>
        <Button
          className="min-h-11 sm:min-h-9"
          variant={props.all || !props.waitingMany ? "default" : "outline"}
        >
          <CalendarCheck aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className={dialogFrameClassName("small")}>
        <CloseDayForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

interface CloseDayFormProps {
  /**
   * Closing every waiting day with one reason, offered while the same items
   * hold every one of them (CLOSE-01); absent for the oldest day on its own.
   */
  all?: { count: number; from: string; to: string } | undefined;
  /**
   * "Close all" is offered next to this button, which is then "only" the
   * oldest day. Where it is not, "only" would name an alternative that is not
   * there (ARRIVALS-11).
   */
  alongsideAll?: boolean;
  businessDate: string;
  dayLabel: string;
  /** What the close of this day will charge, as the room nights card says it. */
  charges: string | null;
  /** The items holding the day open, by name, so the reason can name them. */
  items: readonly { name: string; detail: string }[];
  locale: string;
  openItems: number;
  propertyId: string;
  /** More than one day waits, so this one is offered as "only" the oldest. */
  waitingMany: boolean;
}

function CloseDayForm({
  all,
  businessDate,
  charges,
  dayLabel,
  items,
  locale,
  openItems,
  propertyId,
}: CloseDayFormProps) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  const [outcome, act, pending] = useActionState<CloseDayOutcome, FormData>(
    all ? closeWaitingDays : closeBusinessDay,
    "idle",
  );

  const dayHasMovedOn =
    outcome === "alreadyClosed" ||
    outcome === "refused" ||
    outcome === "partial";

  const message =
    outcome === "alreadyClosed"
      ? t("closeDay.alreadyClosed")
      : outcome === "reasonRequired"
        ? t("closeDay.reasonRequired")
        : outcome === "reasonTooShort"
          ? t("reasonTooShort", { min: REASON.min })
          : outcome === "reasonTooLong"
            ? t("reasonTooLong", { max: REASON.max })
            : outcome === "partial"
              ? t("closeDay.partial")
              : outcome === "failed"
                ? t("refusalFailed")
                : outcome === "refused"
                  ? t("closeDay.refused")
                  : null;

  const needsReason = openItems > 0 && reason.trim().length < REASON.min;

  return (
    <form action={act} className="grid">
      <DialogMasthead
        art="/illustrations/dialogs/close-day.svg"
        eyebrow={
          all
            ? t("closeDay.dialogAllHeading", { n: all.count })
            : t("closeDay.dialogHeading")
        }
        heading={all ? `${all.from} – ${all.to}` : dayLabel}
      />

      <DialogBody simple={openItems === 0}>
        <DialogDescription className="sr-only">
          {all
            ? openItems > 0
              ? t("closeDay.dialogAllOpen", { n: openItems })
              : t("closeDay.dialogAllQuiet")
            : openItems > 0
              ? t("closeDay.dialogOpen", { n: openItems })
              : t("closeDay.dialogQuiet")}
        </DialogDescription>

        <input name="locale" type="hidden" value={locale} />
        <input name="property" type="hidden" value={propertyId} />
        <input name="day" type="hidden" value={businessDate} />

        {/* The one thing a close cannot be undone for is said first and on
            its own, above anything asked of the desk (ARRIVALS-12). */}
        <div className={openItems > 0 ? "pt-5" : undefined}>
          <DialogNotice icon={TriangleAlert}>
            {t("closeDay.final")}
          </DialogNotice>
        </div>

        {openItems === 0 ? (
          <DialogSettled title={t("closeDay.quietTitle")}>
            {all ? t("closeDay.dialogAllQuiet") : t("closeDay.dialogQuiet")}
          </DialogSettled>
        ) : null}

        {items.length > 0 ? (
          <DialogSection
            hint={t("closeDay.itemsOpenHint")}
            title={t("closeDay.itemsOpenTitle", { n: openItems })}
          >
            <DialogFacts rows={items.map((item) => [item.name, item.detail])} />
          </DialogSection>
        ) : null}

        {openItems > 0 ? (
          <DialogSection
            hint={t("closeDay.reasonHint")}
            labelFor="close-day-reason"
            tag={{ label: t("dialogTagRequired"), required: true }}
            title={t("closeDay.reasonQuestion")}
          >
            <Textarea
              autoFocus
              className={textareaClassName}
              aria-describedby="close-day-reason-hint"
              id="close-day-reason"
              maxLength={REASON.max}
              minLength={REASON.min}
              name="reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("closeDay.reasonExample")}
              required
              rows={3}
              value={reason}
            />
          </DialogSection>
        ) : null}

        <div className={openItems > 0 ? "py-5" : undefined}>
          <DialogNotice>
            <span className="block">{t("closeDay.dialogCharges")}</span>
            {charges ? (
              <bdi className="mt-1 block font-medium tabular-nums">
                {charges}
              </bdi>
            ) : null}
          </DialogNotice>
        </div>

        {message ? (
          <div className={openItems > 0 ? "pb-5" : undefined}>
            <FormError>{message}</FormError>
          </div>
        ) : null}
      </DialogBody>

      <DialogActions hint={needsReason ? t("dialogHintReason") : null}>
        {dayHasMovedOn ? (
          // The day this was about is closed, or no longer the one waiting:
          // pressing it again could only be refused again, so the only thing
          // left is to dismiss, which refreshes the screen to the day it shows
          // now.
          <DialogClose asChild>
            <Button type="button">{t("closeDay.dismissed")}</Button>
          </DialogClose>
        ) : (
          <>
            <DialogClose asChild>
              <CancelButton type="button">
                {t("closeDay.keepOpen")}
              </CancelButton>
            </DialogClose>
            <ArrowButton disabled={pending || needsReason} type="submit">
              {pending
                ? t("closeDay.closing")
                : all
                  ? t("closeDay.closeAll", { n: all.count })
                  : t("closeDay.close", { date: dayLabel })}
            </ArrowButton>
          </>
        )}
      </DialogActions>
    </form>
  );
}
