"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatMoney, type SupportedLocale } from "@ranza/i18n";
import type { DeparturePreview } from "@ranza/reservations";
import {
  Button,
  DateRangeField,
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
  changeDeparture,
  type ChangeDepartureOutcome,
} from "../../../server/front-office";
import { submitWithoutReset } from "../../../lib/submit-without-reset";

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
 */
const NOTE = { min: 3, max: 500 };

export interface ChangeableStay {
  stayId: string;
  reference: string | null;
  guestName: string;
  unitLabel: string;
  startsOn: string;
  endsOn: string | null;
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
  onDone,
  onOpenChange,
  open,
  stay,
}: {
  locale: SupportedLocale;
  /** Told after a change is saved, for a screen that keeps its own data. */
  onDone?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  stay: ChangeableStay;
}) {
  const t = useTranslations();
  const [endsOn, setEndsOn] = useState<string | undefined>(
    stay.endsOn ?? undefined,
  );
  const [note, setNote] = useState("");
  const [read, setRead] = useState<Read>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  const resetFromPreview = useRef(true);
  const pinnedRef = useRef<number | null>(null);
  const [pinned, setPinned] = useState<{
    version: number;
    endsOn: string | null;
  } | null>(null);
  const [movedUnderneath, setMovedUnderneath] = useState(false);
  // Known from the first read. A Guest's Stay always has a departure, so a
  // cleared end is asked about rather than previewed as open-ended.
  const [stayType, setStayType] = useState<DeparturePreview["stayType"] | null>(
    null,
  );
  const needsEnd = stayType === "guest" && !endsOn;
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
        if (resetFromPreview.current || stale) {
          if (stale) setMovedUnderneath(true);
          resetFromPreview.current = false;
          pinnedRef.current = fresh.version;
          setPinned({ version: fresh.version, endsOn: fresh.endsOn });
          setEndsOn(fresh.endsOn ?? undefined);
          setResets((n) => n + 1);
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
    if (!endsOn) return t("changeDepartureOpen");
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

  const readMessage = needsEnd
    ? t("changeDepartureNeedsEnd")
    : read.state === "failed"
      ? t("changeBookingLoadFailed")
      : read.state === "invalidPeriod"
        ? t("bookingPeriodInvalid")
        : read.state === "refused"
          ? t("changeDepartureRefused")
          : preview?.blocker === "booked"
            ? t("changeDepartureBlocked", {
                reference: preview.conflictReference ?? "",
              })
            : null;

  const outcomeMessage =
    outcome === "changed" || movedUnderneath
      ? t("changeBookingChanged")
      : outcome === "occupied"
        ? t("bookingOverOccupant")
        : outcome === "invalidPeriod"
          ? t("bookingPeriodInvalid")
          : outcome === "invalidNote"
            ? t("changeBookingNoteInvalid")
            : outcome === "refused"
              ? t("changeDepartureRefused")
              : null;

  const canSave =
    preview !== null &&
    pinned !== null &&
    preview.blocker === null &&
    !unchanged &&
    (endsOn !== undefined || preview.stayType === "resident") &&
    (endsOn === undefined || endsOn > preview.today);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form className="grid gap-4" onSubmit={submitWithoutReset(act)}>
          <DialogHeader>
            <DialogTitle>{t("changeDeparture")}</DialogTitle>
            <DialogDescription>{t("changeDepartureSummary")}</DialogDescription>
          </DialogHeader>

          <FactList className="gap-4 pt-0">
            <Fact label={t("guest")}>
              <bdi>{stay.guestName}</bdi>
            </Fact>
            {stay.reference ? (
              <Fact label={t("reservation")}>
                <span className="font-mono tabular-nums">{stay.reference}</span>
              </Fact>
            ) : null}
            <Fact label={t("unit")}>
              <bdi className="tabular-nums">{stay.unitLabel}</bdi>
            </Fact>
          </FactList>

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

          <DialogFooter>
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
