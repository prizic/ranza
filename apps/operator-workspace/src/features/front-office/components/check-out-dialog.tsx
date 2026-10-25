"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlarmClock, ArrowUpRight, Info, LogOut } from "lucide-react";
import type { Departure } from "@ranza/reservations";
import {
  formatDate,
  formatMoney,
  isolate,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
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
  DialogFigure,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  DialogSettled,
  dialogFrameClassName,
  DialogTrigger,
  FormError,
  SuggestionRow,
  TickRow,
  Textarea,
  textareaClassName,
} from "@ranza/ui";
import {
  checkOutStay,
  type CheckOutOutcome,
} from "../../../server/front-office";
import {
  checkOutMarker,
  focusCheckOutOf,
  nextCheckOutAfter,
} from "../check-out-focus";
import { unitLabel } from "../unit-label";
import { refusalMessage } from "../refusal";

/**
 * Checking a Guest out, from a review of their bill (CO-S1-12).
 *
 * A dialog rather than a button on the row, because a check-out frees the
 * room for somebody else and cannot be taken back: the desk sees who is
 * leaving, from where, and what they owe before it is final. It asks for more
 * only when there is more to decide — an acknowledgement when the Guest is
 * leaving early, a reason when money is left on the Folio — so a Guest leaving
 * on the day with nothing owed is one press after the review, and the button
 * stays muted, with the footer saying what is missing, until the rest is given.
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
  canOpenFolio = true,
  departure,
  locale,
  onDone,
  propertyId,
}: {
  /** Whether the viewer can open the Folio: the link is not offered to one who cannot. */
  canOpenFolio?: boolean;
  departure: Departure;
  locale: SupportedLocale;
  /** Called once the Guest is out: Today refreshes its figures (TD-S2-02). */
  onDone?: () => void;
  propertyId: string;
}) {
  const t = useTranslations();
  const trigger = useRef<HTMLButtonElement>(null);
  const [outcome, act, pending] = useActionState<CheckOutOutcome, FormData>(
    async (previous, data) => {
      // The next row's button is found before the action runs: this row is
      // gone when it answers, and the keyboard goes on to the next Guest
      // rather than back to the top of the page (ARRIVALS-18).
      const next = nextCheckOutAfter(trigger.current);
      const result = await checkOutStay(previous, data);
      if (result === "done" && next) focusCheckOutOf(next);
      return result;
    },
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
  const inCredit = due < 0;
  const room = unitLabel(departure.roomName, departure.unitName);
  const balance = formatMoney(due, departure.currency, locale);
  const unpriced =
    departure.stayType === "guest" &&
    departure.nightlyRateMinor === null &&
    departure.folioId !== null;

  const leaving = departure.overdue
    ? t("overdue")
    : departure.early
      ? t("checkOutStatusEarly")
      : t("checkOutStatusOnSchedule");
  const folioHref =
    departure.folioId && canOpenFolio
      ? `${localizeHref(locale, "finance")}?property=${propertyId}&folio=${departure.folioId}`
      : null;
  // A new tab when money is owed: the Folio is where it is settled, and
  // leaving this one closes the dialog and forgets the reason already typed.
  // The bill is checked again when it is confirmed.
  const folioLink = folioHref ? (
    <Link
      className="inline-flex items-center gap-1 font-medium text-primary-text underline-offset-4 hover:underline"
      href={folioHref}
      prefetch={false}
      {...(owes ? { rel: "noopener", target: "_blank" } : {})}
    >
      {owes ? t("reviewFolioNewTab") : t("reviewFolio")}
      <ArrowUpRight aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
    </Link>
  ) : null;

  const needsAcknowledgement = departure.early && !acknowledged;
  const needsReason = owes && reason.trim().length < REASON.min;
  const missing =
    needsAcknowledgement && needsReason
      ? t("checkOutHintTickAndReason")
      : needsAcknowledgement
        ? t("checkOutHintTick")
        : needsReason
          ? t("dialogHintReason")
          : null;

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
          ref={trigger}
          size="sm"
          {...checkOutMarker(departure.stayId)}
        >
          <LogOut aria-hidden="true" />
          {t("checkOut")}
        </Button>
      </DialogTrigger>

      <DialogContent className={dialogFrameClassName("small")}>
        <form action={act} className="grid">
          <DialogMasthead
            art="/illustrations/check-out/key.svg"
            eyebrow={t("checkOutTitle")}
            facts={`${t("roomWord")} ${room} · ${leaving}`}
            heading={name}
          />

          <DialogBody simple>
            <DialogDescription className="sr-only">
              {t("checkOutSummary")}
            </DialogDescription>

            {/* The one irreversible act of the day says so where it is read,
                before the figure and the reason box that sit below the fold of
                a long dialog (ARRIVALS-05). */}
            <DialogNotice icon={LogOut}>
              {departure.roomWillBeDirty
                ? t("checkOutFinalDirty")
                : t("checkOutFinal")}
            </DialogNotice>

            {departure.overdue && departure.endsOn ? (
              // One sentence for the booking in front of the desk: an unpriced
              // booking is not charged for its extra nights, and saying both
              // that they are and that they are not was a contradiction
              // (ARRIVALS-04).
              <DialogNotice icon={AlarmClock}>
                {t(unpriced ? "checkOutOverdueUnpriced" : "checkOutOverdue", {
                  count: departure.overdueDays,
                  date: day(departure.endsOn, locale),
                })}
              </DialogNotice>
            ) : unpriced ? (
              <DialogNotice icon={Info}>{t("checkOutUnpriced")}</DialogNotice>
            ) : null}

            {owes ? (
              <DialogFigure
                amount={formatMoney(Math.abs(due), departure.currency, locale)}
                caption={
                  <>
                    {departure.pendingNights > 0 ? (
                      <span>
                        {t("checkOutNightsToCharge")}:{" "}
                        {t("checkOutPendingNights", {
                          count: departure.pendingNights,
                          amount: formatMoney(
                            departure.pendingMinor,
                            departure.currency,
                            locale,
                          ),
                        })}
                      </span>
                    ) : null}
                    {folioLink}
                  </>
                }
                label={
                  inCredit ? t("checkOutCreditLabel") : t("checkOutDueLabel")
                }
              />
            ) : (
              <DialogSettled
                title={
                  departure.folioId
                    ? unpriced
                      ? t("checkOutNothingChargedTitle")
                      : t("checkOutNothingOwedTitle")
                    : t("noFolio")
                }
              >
                {departure.folioId ? (
                  <>
                    {unpriced
                      ? t("checkOutNothingChargedBody")
                      : t("checkOutNothingOwedBody")}{" "}
                    {folioLink}
                  </>
                ) : (
                  t("checkOutNoFolioBody")
                )}
              </DialogSettled>
            )}

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
              <TickRow
                checked={acknowledged}
                id={`early-${departure.stayId}`}
                name="earlyDeparture"
                onCheckedChange={setAcknowledged}
                required
              >
                {t("checkOutEarlyAcknowledge", {
                  date: day(departure.endsOn, locale),
                })}
              </TickRow>
            ) : null}

            {owes ? (
              <DialogSection
                hint={t("checkOutBalanceHint", { balance })}
                labelFor={`balance-reason-${departure.stayId}`}
                tag={{ label: t("dialogTagRequired"), required: true }}
                title={t("checkOutBalanceReason")}
              >
                <Textarea
                  className={textareaClassName}
                  aria-describedby={`balance-reason-${departure.stayId}-hint`}
                  id={`balance-reason-${departure.stayId}`}
                  maxLength={REASON.max}
                  minLength={REASON.min}
                  name="balanceReason"
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t("checkOutReasonPlaceholder")}
                  required
                  rows={3}
                  value={reason}
                />
                <SuggestionRow
                  items={[
                    t("checkOutReasonWillPayLater"),
                    t("checkOutReasonCompanyInvoice"),
                    t("checkOutReasonDisputed"),
                  ]}
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

          <DialogActions hint={missing}>
            <DialogClose asChild>
              <CancelButton type="button">{t("keepInHouse")}</CancelButton>
            </DialogClose>
            <ArrowButton disabled={pending || missing !== null} type="submit">
              {pending ? t("checkingOut") : t("checkOut")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
