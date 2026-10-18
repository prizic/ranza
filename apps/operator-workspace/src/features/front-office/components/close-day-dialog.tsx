"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarCheck } from "lucide-react";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FormError,
  Textarea,
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
    : props.waitingMany
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

      <DialogContent>
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

  return (
    <form action={act} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {all
            ? t("closeDay.dialogAllTitle", {
                n: all.count,
                from: all.from,
                to: all.to,
              })
            : t("closeDay.dialogTitle", { date: dayLabel })}
        </DialogTitle>
        <DialogDescription>
          {all
            ? openItems > 0
              ? t("closeDay.dialogAllOpen", { n: openItems })
              : t("closeDay.dialogAllQuiet")
            : openItems > 0
              ? t("closeDay.dialogOpen", { n: openItems })
              : t("closeDay.dialogQuiet")}
        </DialogDescription>
      </DialogHeader>

      {items.length > 0 ? (
        <div className="grid gap-1.5 text-step--1">
          <p className="font-medium">{t("closeDay.dialogItems")}</p>
          <ul className="grid gap-0.5">
            {items.map((item) => (
              <li key={`${item.name}:${item.detail}`}>
                <bdi className="font-medium">{item.name}</bdi>
                <span className="text-muted-foreground">
                  {" · "}
                  {item.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-step--1">
        {t("closeDay.dialogCharges")}
        {charges ? (
          <>
            {" "}
            <bdi className="font-medium tabular-nums">{charges}</bdi>
          </>
        ) : null}
      </p>

      <input name="locale" type="hidden" value={locale} />
      <input name="property" type="hidden" value={propertyId} />
      <input name="day" type="hidden" value={businessDate} />

      {openItems > 0 ? (
        <>
          <Field htmlFor="close-day-reason" label={t("reason")}>
            <Textarea
              aria-describedby="close-day-reason-hint"
              autoFocus
              id="close-day-reason"
              maxLength={REASON.max}
              minLength={REASON.min}
              name="reason"
              onChange={(event) => setReason(event.target.value)}
              required
              rows={3}
              value={reason}
            />
          </Field>
          <p
            className="text-step--1 text-muted-foreground"
            id="close-day-reason-hint"
          >
            {t("closeDay.reasonHint")}
          </p>
        </>
      ) : null}

      <p className="text-step--1">{t("closeDay.final")}</p>

      {message ? <FormError>{message}</FormError> : null}

      <DialogFooter>
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
              <Button type="button" variant="outline">
                {t("closeDay.keepOpen")}
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit">
              {pending
                ? t("closeDay.closing")
                : all
                  ? t("closeDay.closeAll", { n: all.count })
                  : t("closeDay.close", { date: dayLabel })}
            </Button>
          </>
        )}
      </DialogFooter>
    </form>
  );
}
