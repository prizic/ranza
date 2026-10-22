"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlarmClock,
  CalendarCheck,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  Info,
  LockKeyhole,
  LogOut,
} from "lucide-react";
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
  DialogTrigger,
  Field,
  FormError,
  Label,
  StatusBadge,
  Textarea,
} from "@ranza/ui";
import {
  checkOutStay,
  type CheckOutOutcome,
} from "../../../server/front-office";
import { unitLabel } from "../unit-label";
import { refusalMessage } from "../refusal";
import {
  BillCard,
  BillLine,
  DepartureTicket,
  FolioLink,
  Illustration,
  Notice,
} from "./check-out-parts";

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
 * So do the nights the check-out itself will charge (ADR 0038): nights already
 * slept that no close has reached. The review shows them and the balance they
 * make, and the module refuses to charge anything else — a close that charged
 * one first, or a business date that rolled over, is a changed bill.
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
  onDone,
  propertyId,
}: {
  departure: Departure;
  locale: SupportedLocale;
  /** Called once the Guest is out: Today refreshes its figures (TD-S2-02). */
  onDone?: () => void;
  propertyId: string;
}) {
  const t = useTranslations();
  const [outcome, act, pending] = useActionState<CheckOutOutcome, FormData>(
    checkOutStay,
    "idle",
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (outcome === "done") onDone?.();
  }, [outcome, onDone]);

  const name = departure.guestName || t("noGuestRecorded");
  // What the Folio will hold once check-out has charged its nights: the bill
  // the desk is deciding about.
  const due = departure.balanceMinor + departure.pendingMinor;
  const owes = due !== 0;
  const room = unitLabel(departure.roomName, departure.unitName);
  const balance = formatMoney(due, departure.currency, locale);
  const unpriced =
    departure.stayType === "guest" &&
    departure.nightlyRateMinor === null &&
    departure.folioId !== null;

  const refusal = refusalMessage(outcome);
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
              : refusal
                ? t(refusal)
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

      <DialogContent className="gap-0 p-0 sm:max-w-lg md:max-w-[min(56rem,calc(100%-2rem))]">
        <form
          action={act}
          className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        >
          <DepartureTicket
            departure={
              departure.endsOn ? (
                <time dateTime={departure.endsOn}>
                  {day(departure.endsOn, locale)}
                </time>
              ) : (
                t("openEnded")
              )
            }
            departureLabel={t("plannedDeparture")}
            guest={name}
            status={
              departure.overdue ? (
                <StatusBadge
                  icon={AlarmClock}
                  label={t("overdue")}
                  tone="danger"
                />
              ) : departure.early ? (
                <StatusBadge
                  icon={CalendarClock}
                  label={t("checkOutStatusEarly")}
                  tone="warning"
                />
              ) : (
                <StatusBadge
                  icon={CalendarCheck}
                  label={t("checkOutStatusOnSchedule")}
                  tone="success"
                />
              )
            }
            title={t("checkOutTitle")}
            unit={room}
            unitLabel={t("unit")}
          >
            {departure.overdue && departure.endsOn ? (
              <Notice icon={AlarmClock} tone="warning">
                {t("checkOutOverdue", {
                  count: departure.overdueDays,
                  date: day(departure.endsOn, locale),
                })}
              </Notice>
            ) : null}

            {unpriced ? (
              <Notice icon={Info} tone="info">
                {t("checkOutUnpriced")}
              </Notice>
            ) : null}

            {departure.roomWillBeDirty ? (
              <Notice art="housekeeping">{t("checkOutRoomDirty")}</Notice>
            ) : null}
          </DepartureTicket>

          <div className="grid content-start gap-4 p-6 md:pt-14">
            <BillCard
              amount={
                departure.folioId ? (
                  balance
                ) : (
                  <span className="text-step-2 text-muted-foreground">
                    {t("noFolio")}
                  </span>
                )
              }
              art={owes ? "bill-due" : "bill-settled"}
              label={
                departure.pendingNights > 0
                  ? t("balanceAfterCheckOut")
                  : t("balance")
              }
              status={
                departure.folioId ? (
                  owes ? (
                    <StatusBadge
                      icon={CircleAlert}
                      label={t("checkOutStatusOwed")}
                      tone="warning"
                    />
                  ) : (
                    <StatusBadge
                      icon={CircleCheck}
                      label={t("checkOutStatusSettled")}
                      tone="success"
                    />
                  )
                ) : null
              }
            >
              {departure.pendingNights > 0 ? (
                <BillLine
                  label={t("checkOutNightsToCharge")}
                  value={t("checkOutPendingNights", {
                    count: departure.pendingNights,
                    amount: formatMoney(
                      departure.pendingMinor,
                      departure.currency,
                      locale,
                    ),
                  })}
                />
              ) : null}
              {departure.folioId ? (
                // A new tab when money is owed: the Folio is where it is
                // settled, and leaving this one closes the dialog and forgets
                // the reason already typed. The bill is checked again when it
                // is confirmed.
                <FolioLink
                  href={`${localizeHref(locale, "finance")}?property=${propertyId}&folio=${departure.folioId}`}
                  newTab={owes}
                >
                  {owes ? t("reviewFolioNewTab") : t("reviewFolio")}
                </FolioLink>
              ) : null}
            </BillCard>

            <input name="stay" type="hidden" value={departure.stayId} />
            <input name="locale" type="hidden" value={locale} />
            <input
              name="folioVersion"
              type="hidden"
              value={departure.folioVersion ?? ""}
            />
            <input
              name="pendingNights"
              type="hidden"
              value={departure.pendingNights}
            />
            <input
              name="pendingMinor"
              type="hidden"
              value={departure.pendingMinor}
            />

            {departure.early && departure.endsOn ? (
              <Label
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft/40 px-4 py-3 leading-snug"
                htmlFor={`early-${departure.stayId}`}
              >
                <Checkbox
                  checked={acknowledged}
                  id={`early-${departure.stayId}`}
                  name="earlyDeparture"
                  onCheckedChange={(checked) =>
                    setAcknowledged(checked === true)
                  }
                  required
                  value="yes"
                />
                <span className="min-w-0 flex-1">
                  {t("checkOutEarlyAcknowledge", {
                    date: day(departure.endsOn, locale),
                  })}
                </span>
                <Illustration art="early-departure" className="size-12" />
              </Label>
            ) : null}

            {owes ? (
              <div className="grid gap-3 rounded-xl border border-warning/30 bg-warning-soft/40 p-4">
                <p className="m-0 text-step--1 font-medium">
                  {t("checkOutOwesFirst", { balance })}
                </p>
                <Field
                  htmlFor={`balance-reason-${departure.stayId}`}
                  label={t("checkOutBalanceReason")}
                >
                  <Textarea
                    aria-describedby={`balance-hint-${departure.stayId}`}
                    className="bg-card"
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
                  className="m-0 text-step--1 text-muted-foreground"
                  id={`balance-hint-${departure.stayId}`}
                >
                  {t("checkOutBalanceHint", { balance })}
                </p>
              </div>
            ) : null}

            {message ? (
              <div aria-live="polite">
                <FormError>{message}</FormError>
              </div>
            ) : null}

            <DialogDescription className="flex items-start gap-2 text-step--1">
              <LockKeyhole
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {t("checkOutSummary")}
            </DialogDescription>
          </div>

          <DialogFooter className="bottom-0 mx-0 mb-0 border-t px-6 py-4 md:col-span-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("keepInHouse")}
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit">
              <LogOut aria-hidden="true" />
              {pending ? t("checkingOut") : t("confirmCheckOut")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
