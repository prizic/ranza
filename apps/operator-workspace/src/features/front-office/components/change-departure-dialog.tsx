"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlarmClock, CircleAlert } from "lucide-react";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import type { DeparturePreview } from "@ranza/reservations";
import {
  Button,
  cn,
  DateRangeField,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTicket,
  Field,
  FormError,
  Textarea,
  TicketNotice,
  ticketBodyClassName,
  ticketDialogWideClassName,
  ticketFooterClassName,
  ticketWideFormClassName,
} from "@ranza/ui";
import {
  changeDeparture,
  type ChangeDepartureOutcome,
} from "../../../server/front-office";
import { submitWithoutReset } from "../../../lib/submit-without-reset";
import { overdueDays } from "../../today/views";
import { describePeriod, MoveSummary } from "./move-summary";
import { refusalMessage } from "../refusal";

/**
 * Extending or shortening an in-house Guest's Stay, or giving an open-ended
 * one an end (amend-booking slice 2, ADR 0039).
 *
 * The arrival is shown and cannot change; only the departure is picked, and
 * no day before tomorrow is offered — leaving today is a check-out. Each
 * chosen day is previewed: whether a booking holds a night it would add, and
 * what the extra nights cost, which is the booking's own price.
 *
 * The version is pinned to the departure it last filled in, as in Change
 * booking and for the same reason: a later read that names another version
 * refills the field and says so, rather than letting one press of Save
 * overwrite a change nobody here has seen (AB-S1-19).
 *
 * Opened by pulling a bar's end on the room calendar it starts on the day
 * dropped, and names what the calendar already knows against it above the same
 * preview (RC-S3-08).
 */
const NOTE = { min: 3, max: 500 };

/** The departure a drag proposes, and what is known against it. */
export interface ProposedDeparture {
  endsOn: string | null;
  /** The reasons the calendar already knows the Guest cannot leave then. */
  conflictsFor: (endsOn: string | null) => string[];
}

export interface ChangeableStay {
  stayId: string;
  reference: string | null;
  guestName: string;
  unitLabel: string;
  startsOn: string;
  endsOn: string | null;
  /**
   * The booking has no price, so the nights an extension adds are not charged;
   * said when the dialog opens, before any date is chosen.
   */
  unpriced?: boolean;
}

type PreviewAnswer =
  | { kind: "preview"; preview: DeparturePreview }
  | { kind: "refused" }
  | { kind: "invalidPeriod" };

type Read =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "refused" }
  | { state: "invalidPeriod" }
  | { state: "ready"; preview: DeparturePreview };

async function fetchPreview(
  stayId: string,
  to: string | undefined,
  signal: AbortSignal,
): Promise<PreviewAnswer> {
  const params = new URLSearchParams({ stay: stayId });
  if (to) params.set("to", to);
  const response = await fetch(`/api/front-office/departure-change?${params}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw Object.assign(new Error("the departure could not be previewed"), {
      status: response.status,
    });
  }
  return (await response.json()) as PreviewAnswer;
}

/** Nights between two `YYYY-MM-DD` dates, counted in UTC so no clock shifts them. */
function nightsBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

function tomorrowOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function ChangeDepartureDialog({
  locale,
  move,
  onDone,
  onOpenChange,
  open,
  stay,
}: {
  locale: SupportedLocale;
  move?: ProposedDeparture;
  /** Told after a change is saved, for a screen that keeps its own data. */
  onDone?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  stay: ChangeableStay;
}) {
  const t = useTranslations();
  const [endsOn, setEndsOn] = useState<string | undefined>(
    (move ? move.endsOn : stay.endsOn) ?? undefined,
  );
  const [note, setNote] = useState("");
  const [read, setRead] = useState<Read>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  const resetFromPreview = useRef(move === undefined);
  const pinnedRef = useRef<number | null>(null);
  const [pinned, setPinned] = useState<{
    version: number;
    endsOn: string | null;
  } | null>(null);
  const [movedUnderneath, setMovedUnderneath] = useState(false);
  // The planned departure an overdue Guest has gone past, kept to say so.
  const [overdueSince, setOverdueSince] = useState<string | null>(null);
  // Known from the first read. A Guest's Stay always has a departure, so a
  // cleared end is asked about rather than previewed as open-ended.
  const [stayType, setStayType] = useState<DeparturePreview["stayType"] | null>(
    null,
  );
  const needsEnd = stayType === "guest" && !endsOn && overdueSince === null;
  const [resets, setResets] = useState(0);
  const [outcome, act, pending] = useActionState<
    ChangeDepartureOutcome,
    FormData
  >(async (previous, form) => {
    setMovedUnderneath(false);
    const result = await changeDeparture(previous, form);
    if (result === "changed") resetFromPreview.current = true;
    if (result === "changed" || result === "occupied") {
      setGeneration((n) => n + 1);
    }
    return result;
  }, "idle");

  useEffect(() => {
    if (outcome !== "done") return;
    onDone?.();
    onOpenChange(false);
  }, [outcome, onDone, onOpenChange]);

  useEffect(() => {
    if (!open || needsEnd) return;
    const controller = new AbortController();
    setRead({ state: "loading" });
    fetchPreview(stay.stayId, endsOn, controller.signal)
      .then((answer) => {
        if (answer.kind !== "preview") {
          setRead({ state: answer.kind });
          return;
        }
        const fresh = answer.preview;
        setStayType(fresh.stayType);
        const stale =
          pinnedRef.current === null
            ? fresh.endsOn !== stay.endsOn
            : fresh.version !== pinnedRef.current;
        // A proposal keeps its day on the first read unless the Stay changed
        // after the calendar drew it; either way the version a save is sent
        // with is the one this read named.
        if (pinnedRef.current === null && !stale) {
          pinnedRef.current = fresh.version;
          setPinned({ version: fresh.version, endsOn: fresh.endsOn });
          // A Guest past their departure is asked for the day they now leave:
          // the field does not open on a date already in the past, where Save
          // could never be pressed and nothing said why (ROOMCAL-04).
          if (
            fresh.endsOn !== null &&
            overdueDays(fresh.endsOn, fresh.today) > 0
          ) {
            setOverdueSince(fresh.endsOn);
            setEndsOn(undefined);
            setResets((n) => n + 1);
          }
        }
        if (resetFromPreview.current || stale) {
          if (stale) setMovedUnderneath(true);
          resetFromPreview.current = false;
          pinnedRef.current = fresh.version;
          setPinned({ version: fresh.version, endsOn: fresh.endsOn });
          // The field is drawn again only for a day it does not show yet:
          // drawing it again takes the focus the dialog gave it on opening.
          if ((fresh.endsOn ?? undefined) !== endsOn) {
            setEndsOn(fresh.endsOn ?? undefined);
            setResets((n) => n + 1);
          }
        }
        setRead({ state: "ready", preview: fresh });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("departure_change.preview_failed", {
          stayId: stay.stayId,
          error,
        });
        setRead({ state: "failed" });
      });
    return () => controller.abort();
  }, [open, needsEnd, stay.stayId, stay.endsOn, endsOn, generation]);

  const preview = read.state === "ready" ? read.preview : null;
  const was = pinned?.endsOn ?? null;
  const unchanged = pinned !== null && (endsOn ?? null) === was;

  const effect = (() => {
    if (!preview || !pinned || unchanged || needsEnd) return null;
    if (!endsOn) return overdueSince ? null : t("changeDepartureOpen");
    if (!was) return null;
    const delta = nightsBetween(was, endsOn);
    if (delta < 0) return t("changeDepartureShorter", { count: -delta });
    // A Resident's nights are billed by the month, never by the night.
    if (preview.stayType === "resident") {
      return t("changeDepartureLongerResident", { count: delta });
    }
    if (preview.nightlyRateMinor === null || preview.rateCurrency === null) {
      return t("changeDepartureLongerUnpriced", { count: delta });
    }
    return t("changeDepartureLonger", {
      count: delta,
      price: formatMoney(
        preview.nightlyRateMinor,
        preview.rateCurrency,
        locale,
      ),
    });
  })();

  // What the calendar knew before the database was asked. Said once: the
  // database's own words for the same nights are kept for what only it sees.
  const known = move && endsOn !== undefined ? move.conflictsFor(endsOn) : [];
  const words = {
    openEnded: t("bookingOpenEnded"),
    nights: (count: number) => t("stayNights", { count }),
  };

  const readMessage = needsEnd
    ? t("changeDepartureNeedsEnd")
    : read.state === "failed"
      ? t("changeBookingLoadFailed")
      : read.state === "invalidPeriod"
        ? t("bookingPeriodInvalid")
        : read.state === "refused"
          ? t("changeDepartureRefused")
          : preview?.blocker === "booked" && known.length === 0
            ? t("changeDepartureBlocked", {
                reference: preview.conflictReference ?? "",
              })
            : null;

  const refusal = refusalMessage(outcome);
  const outcomeMessage =
    outcome === "changed" || movedUnderneath
      ? t("changeBookingChanged")
      : outcome === "occupied"
        ? t("bookingOverOccupant")
        : outcome === "invalidPeriod"
          ? t("bookingPeriodInvalid")
          : outcome === "invalidNote"
            ? t("changeBookingNoteInvalid")
            : refusal
              ? t(refusal)
              : null;

  const canSave =
    known.length === 0 &&
    preview !== null &&
    pinned !== null &&
    preview.blocker === null &&
    !unchanged &&
    (endsOn !== undefined || preview.stayType === "resident") &&
    (endsOn === undefined || endsOn > preview.today);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={cn(ticketDialogWideClassName, "max-h-[90dvh]")}>
        <form
          className={ticketWideFormClassName}
          onSubmit={submitWithoutReset(act)}
        >
          <DialogTicket
            art="/illustrations/dialogs/change-departure.svg"
            eyebrow={t("changeDeparture")}
            heading={stay.guestName}
            stub={[
              ...(stay.reference
                ? [
                    {
                      label: t("reservation"),
                      value: (
                        <span className="font-mono">{stay.reference}</span>
                      ),
                    },
                  ]
                : []),
              { label: t("unit"), value: <bdi>{stay.unitLabel}</bdi> },
            ]}
          >
            {overdueSince && preview ? (
              <TicketNotice icon={AlarmClock} tone="warning">
                {t("changeDepartureOverdue", {
                  count: overdueDays(overdueSince, preview.today),
                  date: formatDate(
                    new Date(`${overdueSince}T00:00:00Z`),
                    locale,
                    { month: "short", timeZone: "UTC" },
                  ),
                })}
              </TicketNotice>
            ) : null}

            {stay.unpriced ? (
              <TicketNotice icon={CircleAlert} tone="warning">
                {t("extendUnpricedWarning")}
              </TicketNotice>
            ) : null}
          </DialogTicket>

          <div className={cn(ticketBodyClassName, "md:pt-14")}>
            <DialogDescription>{t("changeDepartureSummary")}</DialogDescription>

            {move ? (
              <MoveSummary
                conflicts={known}
                from={{
                  place: stay.unitLabel,
                  period: describePeriod(
                    stay.startsOn,
                    stay.endsOn,
                    locale,
                    words,
                  ),
                }}
                to={{
                  place: stay.unitLabel,
                  period: describePeriod(
                    stay.startsOn,
                    endsOn ?? null,
                    locale,
                    words,
                  ),
                }}
              />
            ) : null}

            <input name="stay" type="hidden" value={stay.stayId} />
            <input name="locale" type="hidden" value={locale} />
            <input name="version" type="hidden" value={pinned?.version ?? ""} />

            <Field htmlFor={`departure-${stay.stayId}`} label={t("stayDates")}>
              <DateRangeField
                defaultValue={{ from: stay.startsOn, to: endsOn }}
                earliestTo={preview ? tomorrowOf(preview.today) : undefined}
                id={`departure-${stay.stayId}`}
                key={resets}
                labels={{
                  from: t("arrival"),
                  to: t("departure"),
                  emptyFrom: t("bookingAddDate"),
                  emptyTo: t("bookingOpenEnded"),
                  pickFrom: t("bookingPickArrival"),
                  pickTo: t("bookingPickDeparture"),
                  clear: t("dateRangeClear"),
                  done: t("dateRangeDone"),
                  span: (nights) => t("stayNights", { count: nights }),
                }}
                locale={locale}
                lockFrom
                minSpan={1}
                names={{ from: "startsOn", to: "endsOn" }}
                onChange={(range) => setEndsOn(range.to)}
                today={preview?.today}
              />
            </Field>

            <div aria-live="polite" className="grid gap-2">
              {read.state === "loading" ? (
                <p className="text-step--1 text-muted-foreground">
                  {t("changeBookingChecking")}
                </p>
              ) : null}
              {readMessage ? <FormError>{readMessage}</FormError> : null}
              {effect && !readMessage ? (
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-step--1">
                  <bdi>{effect}</bdi>
                </p>
              ) : null}
              {unchanged ? (
                <p className="text-step--1 text-muted-foreground">
                  {t("changeDepartureNothing")}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Field
                htmlFor={`departure-note-${stay.stayId}`}
                label={t("changeBookingNote")}
              >
                <Textarea
                  id={`departure-note-${stay.stayId}`}
                  maxLength={NOTE.max}
                  minLength={NOTE.min}
                  name="note"
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  value={note}
                />
              </Field>
              <p className="text-step--1 text-muted-foreground">
                {t("changeBookingNoteHint")}
              </p>
            </div>

            {outcomeMessage ? (
              <div aria-live="polite">
                <FormError>{outcomeMessage}</FormError>
              </div>
            ) : null}
          </div>

          <DialogFooter className={ticketFooterClassName}>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("keepAsItWas")}
              </Button>
            </DialogClose>
            <Button disabled={pending || !canSave} type="submit">
              {pending ? t("saving") : t("saveDeparture")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
