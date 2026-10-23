"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatMoney, type SupportedLocale } from "@ranza/i18n";
import type { ChangeOption, ChangePreview } from "@ranza/reservations";
import {
  ArrowButton,
  CancelButton,
  DateRangeField,
  Dialog,
  DialogActions,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogSection,
  dialogFrameClassName,
  fieldClassName,
  FormError,
  Input,
  OptionList,
  type OptionListItem,
  Textarea,
  textareaClassName,
} from "@ranza/ui";
import {
  changeBooking,
  type ChangeBookingOutcome,
} from "../../../server/front-office";
import { submitWithoutReset } from "../../../lib/submit-without-reset";
import { unitLabel } from "../unit-label";
import { refusalMessage } from "../refusal";
import { describePeriod, MoveSummary } from "./move-summary";

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
 * Opened by a drag on the room calendar, or by its Move…, it starts on the
 * nights and Unit proposed and names what the calendar already knows against
 * them above the same preview (RC-S3-04). That is the only difference: the
 * preview, the quote and the save are this dialog's own. The Unit it names
 * moves into From → To, and the expected arrival is left out — a move says
 * nothing of it, so a save leaves it as it is.
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

/** Where a drag or Move… proposes to put the booking, and what is known against it. */
export interface ProposedMove {
  to: {
    unitId: string;
    /**
     * The proposed room's name, for the field to show while the rooms are still
     * loading; without it the field stays empty rather than showing an id.
     */
    unitLabel?: string;
    startsOn: string;
    endsOn: string | null;
  };
  /** The reasons the calendar already knows the booking cannot go there. */
  conflictsFor: (target: {
    unitId: string;
    startsOn: string;
    endsOn: string | null;
  }) => string[];
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
  move,
  onOpenChange,
  open,
}: {
  booking: ChangeableBooking;
  locale: SupportedLocale;
  move?: ProposedMove;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const t = useTranslations();
  const start = move?.to ?? booking;
  const [dates, setDates] = useState<{ from?: string; to?: string }>({
    from: start.startsOn,
    ...(start.endsOn ? { to: start.endsOn } : {}),
  });
  const [unitId, setUnitId] = useState(start.unitId);
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
  const resetFromPreview = useRef(move === undefined);
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
          // A proposal keeps its fields on the first read unless the booking
          // changed after the calendar drew it; either way the version a save
          // is sent with is the one this read named.
          if (pinnedRef.current === null && !stale) {
            pinnedRef.current = fresh.version;
            setPinned(fresh.version);
          }
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
      if (preview.stayType === "resident") return t("quoteResident");
      const type = t(`unitType.${chosen.unitType}`);
      // A data gap is not a consequence of the move: the booking losing a
      // price is said as one, and a booking already unpriced is said to be,
      // and only when something is changing (ROOMCAL-06).
      if (preview.nightlyRateMinor !== null && preview.rateCurrency !== null) {
        return t("changeBookingPriceNone", { type });
      }
      return unchanged ? null : t("changeBookingAlreadyUnpriced", { type });
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

  // What the calendar knew before the database was asked. Said once: the
  // database's own words for the same nights are kept for what only it sees.
  const known =
    move && dates.from
      ? move.conflictsFor({
          unitId,
          startsOn: dates.from,
          endsOn: dates.to ?? null,
        })
      : [];
  const blocked =
    known.length > 0
      ? null
      : chosen?.blocker === "booked"
        ? t("changeBookingBlockedBooked", {
            reference: chosen.conflictReference ?? "",
          })
        : chosen?.blocker === "occupied"
          ? t("changeBookingBlockedOccupied")
          : null;
  const words = {
    openEnded: t("bookingOpenEnded"),
    nights: (count: number) => t("stayNights", { count }),
  };

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
  const refusal = refusalMessage(outcome);
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
                    : refusal
                      ? t(refusal)
                      : null;

  // The booking's own Unit may have gone out of order or been split into beds
  // since it was taken: its dates can still change there, and the desk is told
  // why moving onto it again would not be possible.
  const currentNotTaking =
    chosen !== undefined && chosen.current && !chosen.takesBookings;

  const canSave =
    known.length === 0 &&
    preview !== null &&
    pinned !== null &&
    chosen !== undefined &&
    (chosen.takesBookings || chosen.current) &&
    chosen.blocker === null &&
    !beforeToday &&
    !unchanged &&
    dates.from !== undefined &&
    (dates.to !== undefined || preview.stayType === "resident");

  // The rooms, in order. Until the read arrives the proposed one stands alone
  // under its own name when the caller gave it, and the list is empty when it
  // did not: a raw id is never shown (ROOMCAL-05).
  const unitItems: OptionListItem[] = [
    ...(preview === null && move?.to.unitLabel
      ? [{ value: unitId, title: move.to.unitLabel }]
      : []),
    ...[...(preview?.options ?? [])]
      .sort((a, b) =>
        unitLabel(a.roomName, a.unitName).localeCompare(
          unitLabel(b.roomName, b.unitName),
          undefined,
          { numeric: true },
        ),
      )
      .map((option) => ({
        value: option.unitId,
        title: unitLabel(option.roomName, option.unitName),
        description: t(`unitType.${option.unitType}`),
        chip: !option.takesBookings
          ? t("changeBookingUnitNotTaking")
          : option.blocker === "booked"
            ? t("unitChipBooked", { reference: option.conflictReference ?? "" })
            : option.blocker === "occupied"
              ? t("unitChipOccupied")
              : t("unitChipFree"),
        chipMuted: !option.takesBookings || option.blocker !== null,
      })),
  ];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={dialogFrameClassName("medium")}>
        <form className="grid" onSubmit={submitWithoutReset(act)}>
          <DialogMasthead
            art="/illustrations/dialogs/change-booking.svg"
            eyebrow={move ? t("roomCalendar.moveBooking") : t("changeBooking")}
            facts={`${booking.reference} · ${t("unit")} ${booking.unitLabel}`}
            heading={booking.guestName}
          />

          <DialogBody>
            <DialogDescription className="sr-only">
              {move
                ? t("roomCalendar.moveBookingSummary")
                : t("changeBookingSummary")}
            </DialogDescription>

            {move || (!unchanged && dates.from !== undefined) ? (
              // Said for every change and not only a drag: what the booking is
              // now and what it becomes, before the save (RES-12). The Unit is not
              // repeated above it as a fact; the editable field below is it.
              <div className="py-5">
                <MoveSummary
                  conflicts={known}
                  from={{
                    place: booking.unitLabel,
                    period: describePeriod(
                      booking.startsOn,
                      booking.endsOn,
                      locale,
                      words,
                    ),
                  }}
                  to={{
                    place: chosen
                      ? unitLabel(chosen.roomName, chosen.unitName)
                      : (move?.to.unitLabel ?? "—"),
                    period: dates.from
                      ? describePeriod(
                          dates.from,
                          dates.to ?? null,
                          locale,
                          words,
                        )
                      : null,
                  }}
                />
              </div>
            ) : null}

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

            <DialogSection
              labelFor={`change-dates-${booking.reservationId}`}
              tag={{ label: t("dialogTagRequired"), required: true }}
              title={t("stayDates")}
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
              {beforeToday && known.length === 0 ? (
                <p className="m-0 text-step--1 text-destructive">
                  {t("changeBookingBeforeToday")}
                </p>
              ) : null}
            </DialogSection>

            {move ? null : (
              <DialogSection
                hint={t("expectedArrivalHint")}
                labelFor={`change-arrival-${booking.reservationId}`}
                tag={{ label: t("dialogTagOptional") }}
                title={t("expectedArrival")}
              >
                <Input
                  className={`${fieldClassName} sm:max-w-48`}
                  aria-describedby={`change-arrival-${booking.reservationId}-hint`}
                  id={`change-arrival-${booking.reservationId}`}
                  name="expectedArrival"
                  onChange={(event) => setArrival(event.target.value)}
                  type="time"
                  value={arrival}
                />
              </DialogSection>
            )}

            <DialogSection
              hint={price && !blocked ? <bdi>{price}</bdi> : null}
              tag={{ label: t("dialogTagRequired"), required: true }}
              title={t("changeBookingWhichUnit")}
            >
              <OptionList
                disabled={preview === null}
                emptyLabel={t("unitNoMatches")}
                items={unitItems}
                moreLabel={(count) => t("unitMore", { count })}
                name="unit"
                onChange={setUnitId}
                required
                searchLabel={t("unitSearch")}
                value={preview === null && !move?.to.unitLabel ? "" : unitId}
              />
              <div aria-live="polite" className="grid gap-2">
                {read.state === "loading" ? (
                  <p className="m-0 text-step--1 text-muted-foreground">
                    {t("changeBookingChecking")}
                  </p>
                ) : null}
                {readMessage ? <FormError>{readMessage}</FormError> : null}
                {blocked ? <FormError>{blocked}</FormError> : null}
                {currentNotTaking ? (
                  <p className="m-0 text-step--1 text-muted-foreground">
                    {t("changeBookingCurrentNotTaking")}
                  </p>
                ) : null}
                {unchanged ? (
                  <p className="m-0 text-step--1 text-muted-foreground">
                    {t("changeBookingNothing")}
                  </p>
                ) : null}
              </div>
            </DialogSection>

            <DialogSection
              hint={t("changeBookingNoteHint")}
              labelFor={`change-note-${booking.reservationId}`}
              tag={{ label: t("dialogTagOptional") }}
              title={t("dialogNoteTitle")}
            >
              <Textarea
                className={textareaClassName}
                aria-describedby={`change-note-${booking.reservationId}-hint`}
                id={`change-note-${booking.reservationId}`}
                maxLength={NOTE.max}
                minLength={NOTE.min}
                name="note"
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("moveGuestNotePlaceholder")}
                rows={2}
                value={note}
              />
            </DialogSection>

            {outcomeMessage ? (
              <div aria-live="polite" className="py-5">
                <FormError>{outcomeMessage}</FormError>
              </div>
            ) : null}
          </DialogBody>

          <DialogActions
            hint={
              blocked || known.length > 0 ? t("changeBookingHintUnit") : null
            }
          >
            <DialogClose asChild>
              <CancelButton type="button">
                {move ? t("keepAsItWas") : t("keepBooking")}
              </CancelButton>
            </DialogClose>
            <ArrowButton disabled={pending || !canSave} type="submit">
              {pending
                ? t("saving")
                : move
                  ? t("roomCalendar.confirmMove")
                  : t("saveChange")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
