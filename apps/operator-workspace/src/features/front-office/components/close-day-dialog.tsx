"use client";

import { useActionState, useState } from "react";
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
 * becomes the one waiting, and the dialog is re-keyed on it.
 */
export function CloseDayDialog({
  businessDate,
  dayLabel,
  locale,
  openItems,
  propertyId,
}: {
  businessDate: string;
  dayLabel: string;
  locale: string;
  openItems: number;
  propertyId: string;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  const [outcome, act, pending] = useActionState<CloseDayOutcome, FormData>(
    closeBusinessDay,
    "idle",
  );

  const message =
    outcome === "alreadyClosed"
      ? t("closeDay.alreadyClosed")
      : outcome === "reasonRequired"
        ? t("closeDay.reasonRequired")
        : outcome === "reasonTooShort"
          ? t("reasonTooShort", { min: REASON.min })
          : outcome === "reasonTooLong"
            ? t("reasonTooLong", { max: REASON.max })
            : outcome === "refused"
              ? t("closeDay.refused")
              : null;

  return (
    <Dialog onOpenChange={(open) => !open && setReason("")}>
      <DialogTrigger asChild>
        <Button>
          <CalendarCheck aria-hidden="true" />
          {t("closeDay.close", { date: dayLabel })}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form action={act} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {t("closeDay.dialogTitle", { date: dayLabel })}
            </DialogTitle>
            <DialogDescription>
              {openItems > 0
                ? t("closeDay.dialogOpen", { n: openItems })
                : t("closeDay.dialogQuiet")}
            </DialogDescription>
          </DialogHeader>

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
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("closeDay.keepOpen")}
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit">
              {pending
                ? t("closeDay.closing")
                : t("closeDay.close", { date: dayLabel })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
