"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import type { Departure } from "@ranza/reservations";
import {
  formatDate,
  formatMoney,
  isolate,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Fact,
  FactList,
  Field,
  FormError,
  Label,
  Textarea,
} from "@ranza/ui";
import {
  checkOutStay,
  type CheckOutOutcome,
} from "../../../server/front-office";
import { unitLabel } from "../unit-label";

/**
 * Checking a Guest out, from a review of their bill (CO-S1-12).
 *
 * A dialog rather than a button on the row, because a check-out frees the
 * room for somebody else and cannot be taken back: the desk sees who is
 * leaving, from where, and what they owe before it is final. It asks for more
 * only when there is more to decide — an acknowledgement when the Guest is
 * leaving early, a reason when money is left on the Folio — so a Guest leaving
 * on the day with nothing owed is one press after the review.
 *
 * The Folio's line count travels back hidden. The module compares it with the
 * bill under the Stay's lock, so a charge posted while this was open is not
 * settled by somebody who never saw it; the screen then says the bill changed
 * and the list, which polls, already shows the new one.
 *
 * `REASON` restates `BALANCE_REASON` for the reason `undo-check-in-dialog.tsx`
 * gives: a value import from the module's entry point pulls Prisma into the
 * browser bundle.
 */
const REASON = { min: 3, max: 2000 };

function day(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    month: "short",
    timeZone: "UTC",
  });
}

export function CheckOutDialog({
  departure,
  locale,
}: {
  departure: Departure;
  locale: SupportedLocale;
}) {
  const t = useTranslations();
  const [outcome, act, pending] = useActionState<CheckOutOutcome, FormData>(
    checkOutStay,
    "idle",
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");

  const name = departure.guestName || t("noGuestRecorded");
  const owes = departure.balanceMinor !== 0;
  const room = unitLabel(departure.roomName, departure.unitName);
  const balance = formatMoney(
    departure.balanceMinor,
    departure.currency,
    locale,
  );

  const message =
    outcome === "folioChanged"
      ? t("checkOutFolioChanged")
      : outcome === "earlyNotAcknowledged"
        ? t("checkOutEarlyRequired")
        : outcome === "balanceReasonRequired"
          ? t("checkOutBalanceReasonRequired")
          : outcome === "reasonTooShort"
            ? t("reasonTooShort", { min: REASON.min })
            : outcome === "reasonTooLong"
              ? t("reasonTooLong", { max: REASON.max })
              : outcome === "refused"
                ? t("checkOutRefused")
                : null;

  return (
    <Dialog
      onOpenChange={(open) => {
        // Dismissing forgets what was typed: coming back later to a decision
        // made about a different bill is worse than an empty field.
        if (!open) {
          setAcknowledged(false);
          setReason("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          aria-label={t("checkOutFor", { guest: isolate(name) })}
          size="sm"
        >
          <LogOut aria-hidden="true" />
          {t("checkOut")}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form action={act} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("checkOutTitle")}</DialogTitle>
            <DialogDescription>{t("checkOutSummary")}</DialogDescription>
          </DialogHeader>

          <FactList className="gap-4 pt-0">
            <Fact label={t("guest")}>
              <bdi>{name}</bdi>
            </Fact>
            <Fact label={t("unit")}>
              <bdi className="tabular-nums">{room}</bdi>
            </Fact>
            <Fact label={t("plannedDeparture")}>
              {departure.endsOn ? (
                <time dateTime={departure.endsOn}>
                  {day(departure.endsOn, locale)}
                </time>
              ) : (
                t("openEnded")
              )}
            </Fact>
            <Fact label={t("balance")}>
              {departure.folioId ? (
                <span
                  className={
                    owes ? "font-semibold tabular-nums" : "tabular-nums"
                  }
                >
                  {balance}
                </span>
              ) : (
                t("noFolio")
              )}
            </Fact>
          </FactList>

          {departure.folioId ? (
            <Link
              className="text-step--1 underline underline-offset-4"
              href={`${localizeHref(locale, "finance")}?folio=${departure.folioId}`}
            >
              {t("reviewFolio")}
            </Link>
          ) : null}

          <input name="stay" type="hidden" value={departure.stayId} />
          <input name="locale" type="hidden" value={locale} />
          <input
            name="folioVersion"
            type="hidden"
            value={departure.folioVersion ?? ""}
          />

          {departure.early && departure.endsOn ? (
            <div className="flex items-start gap-3">
              <Checkbox
                checked={acknowledged}
                id={`early-${departure.stayId}`}
                name="earlyDeparture"
                onCheckedChange={(checked) => setAcknowledged(checked === true)}
                required
                value="yes"
              />
              <Label
                className="leading-snug"
                htmlFor={`early-${departure.stayId}`}
              >
                {t("checkOutEarlyAcknowledge", {
                  date: day(departure.endsOn, locale),
                })}
              </Label>
            </div>
          ) : null}

          {owes ? (
            <>
              <Field
                htmlFor={`balance-reason-${departure.stayId}`}
                label={t("checkOutBalanceReason")}
              >
                <Textarea
                  aria-describedby={`balance-hint-${departure.stayId}`}
                  id={`balance-reason-${departure.stayId}`}
                  maxLength={REASON.max}
                  minLength={REASON.min}
                  name="balanceReason"
                  onChange={(event) => setReason(event.target.value)}
                  required
                  rows={3}
                  value={reason}
                />
              </Field>
              <p
                className="text-step--1 text-muted-foreground"
                id={`balance-hint-${departure.stayId}`}
              >
                {t("checkOutBalanceHint", { balance })}
              </p>
            </>
          ) : null}

          {message ? (
            <div aria-live="polite">
              <FormError>{message}</FormError>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("keepInHouse")}
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit">
              {pending ? t("checkingOut") : t("confirmCheckOut")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
