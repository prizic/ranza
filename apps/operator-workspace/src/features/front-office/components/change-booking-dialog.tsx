"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatMoney, type SupportedLocale } from "@ranza/i18n";
import type { ChangeOption, ChangePreview } from "@ranza/reservations";
import {
  Button,
  Combobox,
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
  Input,
  Textarea,
} from "@ranza/ui";
import {
  changeBooking,
  type ChangeBookingOutcome,
} from "../../../server/front-office";
import { usePickerLabels } from "../../../lib/picker-labels";
import { submitWithoutReset } from "../../../lib/submit-without-reset";
import { unitLabel } from "../unit-label";

/**
 * Changing a booking that has not arrived: its nights, its Unit, or both
 * (amend-booking slice 1, ADR 0039).
 *
 * Controlled, like the ending dialog beside it, because a row menu opens it.
 *
 * Each time the dates change it asks the preview route what the change would
 * do on every Unit it could move to (AB-S1-07): which are free, what holds the
 * others, and what a night would cost. Asked fresh rather than cached — a
 * preview read from memory would be exactly the stale answer this exists to
 * avoid — and it is still a preview: saving is decided by the constraints, and
 * a Unit taken in between is refused with the same words the preview uses.
 *
 * The version and the price it was shown travel back with the save, so a
 * booking somebody else changed meanwhile, or a price that moved, is refused
 * and read again rather than overwritten (AB-S1-19, AB-S1-03).
 *
 * `NOTE` restates `CHANGE_NOTE` for the reason `end-booking-dialog.tsx` gives:
 * a value import from the module pulls Prisma into the browser bundle.
 */
const NOTE = { min: 3, max: 500 };

export interface ChangeableBooking {
  reservationId: string;
  reference: string;
  guestName: string;
  unitLabel: string;
  unitId: string;
  startsOn: string;
  endsOn: string | null;
  /** `HH:MM`, or null when nobody said. */
  expectedArrival: string | null;
}

type PreviewAnswer =
  | { kind: "preview"; preview: ChangePreview }
  | { kind: "refused" }
  | { kind: "invalidPeriod" };

type Read =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "refused" }
  | { state: "invalidPeriod" }
  | { state: "ready"; preview: ChangePreview };

async function fetchPreview(
  reservationId: string,
  from: string,
  to: string | undefined,
  signal: AbortSignal,
): Promise<PreviewAnswer> {
  const params = new URLSearchParams({ reservation: reservationId, from });
  if (to) params.set("to", to);
  const response = await fetch(`/api/front-office/booking-change?${params}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw Object.assign(new Error("the change could not be previewed"), {
      status: response.status,
    });
  }
  return (await response.json()) as PreviewAnswer;
}

function sameMoney(
  a: { nightlyRateMinor: number | null; rateCurrency: string | null },
  b: { nightlyRateMinor: number | null; rateCurrency: string | null },
): boolean {
  return (
    a.nightlyRateMinor === b.nightlyRateMinor &&
    a.rateCurrency === b.rateCurrency
  );
}

export function ChangeBookingDialog({
  booking,
  locale,
  onOpenChange,
  open,
}: {
  booking: ChangeableBooking;
  locale: SupportedLocale;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const t = useTranslations();
  const unitLabels = usePickerLabels(t("chooseUnit"));
  const [dates, setDates] = useState<{ from?: string; to?: string }>({
    from: booking.startsOn,
    ...(booking.endsOn ? { to: booking.endsOn } : {}),
  });
  const [unitId, setUnitId] = useState(booking.unitId);
  // `HH:MM`, or empty for none: what a time field holds.
  const [arrival, setArrival] = useState(booking.expectedArrival ?? "");
  const [note, setNote] = useState("");
  const [read, setRead] = useState<Read>({ state: "loading" });
  // Bumped when a save is refused for something the preview did not know —
  // a newer version, a price that moved, a Unit taken in between — so the
  // preview is read again with what stands now.
  const [generation, setGeneration] = useState(0);
  // The version a save is sent with is the one the fields describe, pinned
  // when they were last filled from a preview — never simply the latest one
  // read. Otherwise any later read (after a date is edited, or after a Unit
  // was refused) would carry a newer version under the desk's stale fields,
  // and one press of Save would overwrite a change nobody here has seen
  // (AB-S1-19). So the first preview fills the fields — the row they opened
  // from may already be out of date — and a later one naming another version
  // fills them again and says why.
  const resetFromPreview = useRef(true);
  const pinnedRef = useRef<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [movedUnderneath, setMovedUnderneath] = useState(false);
  // Remounts the uncontrolled date field on that reset, so it shows the dates.
  const [resets, setResets] = useState(0);
  const [outcome, act, pending] = useActionState<
    ChangeBookingOutcome,
    FormData
  >(async (previous, form) => {
    // Each save answers for itself; the read after it says again whether
    // somebody else moved the booking.
    setMovedUnderneath(false);
    const result = await changeBooking(previous, form);
    if (result === "changed") resetFromPreview.current = true;
    if (
      result === "changed" ||
      result === "priceChanged" ||
      result === "unavailable" ||
      result === "occupied" ||
      result === "notInService"
    ) {
      setGeneration((n) => n + 1);
    }
    return result;
  }, "idle");

  useEffect(() => {
    if (outcome === "done") onOpenChange(false);
  }, [outcome, onOpenChange]);

  useEffect(() => {
    if (!open || !dates.from) return;
    const controller = new AbortController();
    setRead({ state: "loading" });
    fetchPreview(booking.reservationId, dates.from, dates.to, controller.signal)
      .then((answer) => {
        if (answer.kind === "preview") {
          const fresh = answer.preview;
          const stale =
            pinnedRef.current === null
              ? fresh.startsOn !== booking.startsOn ||
                fresh.endsOn !== booking.endsOn ||
                fresh.expectedArrival !== booking.expectedArrival ||
                fresh.unitId !== booking.unitId
              : fresh.version !== pinnedRef.current;
          if (resetFromPreview.current || stale) {
            if (stale) setMovedUnderneath(true);
            resetFromPreview.current = false;
            pinnedRef.current = fresh.version;
            setPinned(fresh.version);
            setDates({
              from: fresh.startsOn,
              ...(fresh.endsOn ? { to: fresh.endsOn } : {}),
            });
            setUnitId(fresh.unitId);
            setArrival(fresh.expectedArrival ?? "");
            setResets((n) => n + 1);
          }
          setRead({ state: "ready", preview: fresh });
        } else {
          setRead({ state: answer.kind });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // The route has logged it with the booking and the viewer; this is
        // the browser's half, so a failure the desk sees is never silent.
        console.error("booking_change.preview_failed", {
          reservationId: booking.reservationId,
          error,
        });
        setRead({ state: "failed" });
      });
    return () => controller.abort();
  }, [
    open,
    booking.reservationId,
    booking.startsOn,
    booking.endsOn,
    booking.expectedArrival,
    booking.unitId,
    dates.from,
    dates.to,
    generation,
  ]);

  const preview = read.state === "ready" ? read.preview : null;
  const chosen: ChangeOption | undefined = preview?.options.find(
    (option) => option.unitId === unitId,
  );
  const beforeToday =
    preview !== null && dates.from !== undefined && dates.from < preview.today;
  const unchanged =
    preview !== null &&
    dates.from === preview.startsOn &&
    (dates.to ?? null) === preview.endsOn &&
    arrival === (preview.expectedArrival ?? "") &&
    unitId === preview.unitId;

  const price = (() => {
    if (!preview || !chosen) return null;
    if (chosen.nightlyRateMinor === null || chosen.rateCurrency === null) {
      return preview.stayType === "resident"
        ? t("quoteResident")
        : t("changeBookingPriceNone", {
            type: t(`unitType.${chosen.unitType}`),
          });
    }
    const now = formatMoney(
      chosen.nightlyRateMinor,
      chosen.rateCurrency,
      locale,
    );
    if (
      sameMoney(chosen, preview) ||
      preview.nightlyRateMinor === null ||
      preview.rateCurrency === null
    ) {
      return sameMoney(chosen, preview)
        ? t("changeBookingPriceKept", { price: now })
        : t("quotePerNight", { price: now });
    }
    return t("changeBookingPriceChanges", {
      from: formatMoney(preview.nightlyRateMinor, preview.rateCurrency, locale),
      to: now,
    });
  })();

  const blocked =
    chosen?.blocker === "booked"
      ? t("changeBookingBlockedBooked", {
          reference: chosen.conflictReference ?? "",
        })
      : chosen?.blocker === "occupied"
        ? t("changeBookingBlockedOccupied")
        : null;

  const readMessage =
    read.state === "failed"
      ? t("changeBookingLoadFailed")
      : read.state === "invalidPeriod"
        ? t("bookingPeriodInvalid")
        : read.state === "refused"
          ? t("changeBookingRefused")
          : null;

  // Somebody else's change outranks the refusal that exposed it: the fields
  // now show what stands, and that is what the desk has to read first.
  const outcomeMessage =
    outcome === "changed" || movedUnderneath
      ? t("changeBookingChanged")
      : outcome === "unavailable"
        ? t("bookingUnavailable")
        : outcome === "occupied"
          ? t("bookingOverOccupant")
          : outcome === "notInService"
            ? t("changeBookingNotInService")
            : outcome === "invalidPeriod"
              ? t("bookingPeriodInvalid")
              : outcome === "invalidNote"
                ? t("changeBookingNoteInvalid")
                : outcome === "invalidArrival"
                  ? t("bookingArrivalInvalid")
                  : outcome === "priceChanged"
                    ? t("bookingPriceChanged")
                    : outcome === "refused"
                      ? t("changeBookingRefused")
                      : null;

  // The booking's own Unit may have gone out of order or been split into beds
  // since it was taken: its dates can still change there, and the desk is told
  // why moving onto it again would not be possible.
  const currentNotTaking =
    chosen !== undefined && chosen.current && !chosen.takesBookings;

  const canSave =
    preview !== null &&
    pinned !== null &&
    chosen !== undefined &&
    (chosen.takesBookings || chosen.current) &&
    chosen.blocker === null &&
    !beforeToday &&
    !unchanged &&
    dates.from !== undefined &&
    (dates.to !== undefined || preview.stayType === "resident");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form className="grid gap-4" onSubmit={submitWithoutReset(act)}>
          <DialogHeader>
            <DialogTitle>{t("changeBooking")}</DialogTitle>
            <DialogDescription>{t("changeBookingSummary")}</DialogDescription>
          </DialogHeader>

          <FactList className="gap-4 pt-0">
            <Fact label={t("guest")}>
              <bdi>{booking.guestName}</bdi>
            </Fact>
            <Fact label={t("reservation")}>
              <span className="font-mono tabular-nums">
                {booking.reference}
              </span>
            </Fact>
            <Fact label={t("unit")}>
              <bdi className="tabular-nums">{booking.unitLabel}</bdi>
            </Fact>
          </FactList>

          <input
            name="reservation"
            type="hidden"
            value={booking.reservationId}
          />
          <input name="locale" type="hidden" value={locale} />
          <input name="version" type="hidden" value={pinned ?? ""} />
          <input
            name="quotedRateMinor"
            type="hidden"
            value={chosen?.nightlyRateMinor ?? ""}
          />
          <input
            name="quotedCurrency"
            type="hidden"
            value={
              chosen?.nightlyRateMinor != null
                ? (chosen.rateCurrency ?? "")
                : ""
            }
          />

          <div className="grid gap-1.5">
            <Field
              htmlFor={`change-dates-${booking.reservationId}`}
              label={t("stayDates")}
            >
              <DateRangeField
                key={resets}
                defaultValue={dates}
                id={`change-dates-${booking.reservationId}`}
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
                minSpan={1}
                names={{ from: "startsOn", to: "endsOn" }}
                onChange={setDates}
                required
                today={preview?.today}
              />
            </Field>
            {beforeToday ? (
              <p className="text-step--1 text-destructive">
                {t("changeBookingBeforeToday")}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5 sm:max-w-48">
            <Field
              htmlFor={`change-arrival-${booking.reservationId}`}
              label={t("expectedArrival")}
            >
              <Input
                aria-describedby={`change-arrival-hint-${booking.reservationId}`}
                id={`change-arrival-${booking.reservationId}`}
                name="expectedArrival"
                onChange={(event) => setArrival(event.target.value)}
                type="time"
                value={arrival}
              />
            </Field>
            <p
              className="text-step--1 text-muted-foreground"
              id={`change-arrival-hint-${booking.reservationId}`}
            >
              {t("expectedArrivalHint")}
            </p>
          </div>

          <Field
            htmlFor={`change-unit-${booking.reservationId}`}
            label={t("unit")}
          >
            <Combobox
              disabled={preview === null}
              id={`change-unit-${booking.reservationId}`}
              labels={unitLabels}
              name="unit"
              onValueChange={setUnitId}
              options={(preview?.options ?? []).map((option) => ({
                value: option.unitId,
                label: unitLabel(option.roomName, option.unitName),
                description: [
                  t(`unitType.${option.unitType}`),
                  !option.takesBookings
                    ? t("changeBookingUnitNotTaking")
                    : option.blocker === "booked"
                      ? t("changeBookingUnitBooked", {
                          reference: option.conflictReference ?? "",
                        })
                      : option.blocker === "occupied"
                        ? t("changeBookingUnitOccupied")
                        : t("changeBookingUnitFree"),
                ].join(" · "),
              }))}
              required
              value={unitId}
            />
          </Field>

          <div aria-live="polite" className="grid gap-2">
            {read.state === "loading" ? (
              <p className="text-step--1 text-muted-foreground">
                {t("changeBookingChecking")}
              </p>
            ) : null}
            {readMessage ? <FormError>{readMessage}</FormError> : null}
            {blocked ? <FormError>{blocked}</FormError> : null}
            {currentNotTaking ? (
              <p className="text-step--1 text-muted-foreground">
                {t("changeBookingCurrentNotTaking")}
              </p>
            ) : null}
            {price && !blocked ? (
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-step--1">
                <bdi>{price}</bdi>
              </p>
            ) : null}
            {unchanged ? (
              <p className="text-step--1 text-muted-foreground">
                {t("changeBookingNothing")}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Field
              htmlFor={`change-note-${booking.reservationId}`}
              label={t("changeBookingNote")}
            >
              <Textarea
                aria-describedby={`change-note-hint-${booking.reservationId}`}
                id={`change-note-${booking.reservationId}`}
                maxLength={NOTE.max}
                minLength={NOTE.min}
                name="note"
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                value={note}
              />
            </Field>
            <p
              className="text-step--1 text-muted-foreground"
              id={`change-note-hint-${booking.reservationId}`}
            >
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
              {pending ? t("saving") : t("saveChange")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
