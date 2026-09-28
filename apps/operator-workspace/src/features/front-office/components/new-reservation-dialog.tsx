"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { formatMoney, type SupportedLocale } from "@ranza/i18n";
import type { BookableUnit } from "@ranza/reservations";
import {
  Button,
  Combobox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DateRangeField,
  Field,
  FormError,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import {
  createReservation,
  type CreateReservationOutcome,
} from "../../../server/front-office";
import { usePickerLabels } from "../../../lib/picker-labels";
import { unitLabel } from "../unit-label";

/**
 * Taking a booking.
 *
 * A dialog rather than a page, because it is one short form and the list behind
 * it is the answer: a booking for a fortnight's time appears in that list the
 * moment this closes, which is the only way anybody can tell it worked.
 *
 * Presentational. Nothing here asks whether the viewer may book this Unit, nor
 * whether those nights are free — the first is the policies' answer and the
 * second is `reservations_no_double_booking`'s. A check here would go stale
 * between this page rendering and somebody pressing the button, which is exactly
 * the race the constraint exists to have no window for.
 *
 * Arrival and departure are one field, because they are one decision: the
 * calendar shows the nights between them as they are chosen, which two
 * separate date inputs never could. It still submits `startsOn` and `endsOn` as
 * `YYYY-MM-DD`, which is what the module wants and what the database stores.
 * A departure left empty is an open-ended booking, as before.
 *
 * Once a Unit is chosen the form quotes it (ADR 0038): the price of a night of
 * its kind, and for the nights chosen the total. A quote, not the price — the
 * database stamps the booking from the price list when it is taken — so it is
 * shown and never submitted. An unpriced kind and a Resident each say what that
 * means before the booking is taken, rather than after.
 */

/**
 * `GUEST_DETAILS` in `@ranza/guests`, restated rather than imported: nothing
 * outside `src/server/` may import a Ranza module, and that rule has a fixture
 * proving it fires (ADR 0007). `tests/unit/new-reservation.test.ts` fails if
 * these ever disagree with the module, which is the only thing the import would
 * have bought.
 */
const GUEST = { name: 120, email: 254, phone: 40 };

/** Nights between two `YYYY-MM-DD` dates, counted in UTC so no clock shifts them. */
function nightsBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

export function NewReservationDialog({
  locale,
  propertyId,
  today,
  units,
}: {
  locale: SupportedLocale;
  propertyId: string;
  /** The Property's day, `YYYY-MM-DD`, which the calendar marks as today. */
  today: string;
  units: readonly BookableUnit[];
}) {
  const t = useTranslations();
  const unitLabels = usePickerLabels(t("chooseUnit"));
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState("");
  const [stayType, setStayType] = useState("guest");
  const [dates, setDates] = useState<{ from?: string; to?: string }>({});
  const [outcome, act, pending] = useActionState<
    CreateReservationOutcome,
    FormData
  >(createReservation, "idle");

  // Closed by the booking having happened, not by the button that submitted it.
  // Unlike the withdrawal dialog beside it, this one is not removed by the
  // revalidation — the list gains a row and the trigger stays where it is — so
  // there is a "close on success" to write, and this is it. Every field is
  // uncontrolled, so the next open is a fresh form rather than the last booking.
  useEffect(() => {
    if (outcome === "done") setOpen(false);
  }, [outcome]);

  // Every field is uncontrolled and the next open is a fresh form, so what the
  // quote follows starts again with it.
  function openChanged(next: boolean) {
    setOpen(next);
    if (!next) {
      setUnitId("");
      setStayType("guest");
      setDates({});
    }
  }

  const chosen = units.find((unit) => unit.unitId === unitId);
  const quote = !chosen
    ? null
    : stayType === "resident"
      ? t("quoteResident")
      : chosen.nightlyRateMinor === null || chosen.rateCurrency === null
        ? t("quoteUnpriced", { type: t(`unitType.${chosen.unitType}`) })
        : [
            t("quotePerNight", {
              price: formatMoney(
                chosen.nightlyRateMinor,
                chosen.rateCurrency,
                locale,
              ),
            }),
            ...(dates.from && dates.to
              ? [
                  t("quoteStay", {
                    count: nightsBetween(dates.from, dates.to),
                    total: formatMoney(
                      chosen.nightlyRateMinor *
                        nightsBetween(dates.from, dates.to),
                      chosen.rateCurrency,
                      locale,
                    ),
                  }),
                ]
              : []),
          ].join(" · ");

  const message =
    outcome === "unavailable"
      ? t("bookingUnavailable")
      : outcome === "occupied"
        ? t("bookingOverOccupant")
        : outcome === "invalidPeriod"
          ? t("bookingPeriodInvalid")
          : outcome === "invalidGuest"
            ? t("bookingGuestInvalid")
            : outcome === "refused"
              ? t("bookingRefused")
              : null;

  return (
    <Dialog onOpenChange={openChanged} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden="true" />
          {t("newReservation")}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form action={act} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("newReservation")}</DialogTitle>
            <DialogDescription>{t("newReservationSummary")}</DialogDescription>
          </DialogHeader>

          <input name="property" type="hidden" value={propertyId} />
          <input name="locale" type="hidden" value={locale} />

          <Field htmlFor="booking-guest" label={t("guest")}>
            <Input
              autoComplete="off"
              id="booking-guest"
              maxLength={GUEST.name}
              name="guestName"
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Field htmlFor="booking-email" label={t("guestEmail")}>
                <Input
                  aria-describedby="booking-email-hint"
                  autoComplete="off"
                  id="booking-email"
                  maxLength={GUEST.email}
                  name="guestEmail"
                  type="email"
                />
              </Field>
              <p
                className="text-step--1 text-muted-foreground"
                id="booking-email-hint"
              >
                {t("guestEmailHint")}
              </p>
            </div>
            <Field htmlFor="booking-phone" label={t("guestPhone")}>
              {/* type="tel", so a telephone keypad appears and nothing is
                  parsed: a number with a country code, a space or a dash is
                  still the number somebody was given. */}
              <Input
                autoComplete="off"
                id="booking-phone"
                maxLength={GUEST.phone}
                name="guestPhone"
                type="tel"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="booking-unit" label={t("unit")}>
              <Combobox
                id="booking-unit"
                labels={unitLabels}
                name="unit"
                onValueChange={setUnitId}
                options={units.map((unit) => ({
                  value: unit.unitId,
                  label: unitLabel(unit.roomName, unit.unitName),
                  description: t(`unitType.${unit.unitType}`),
                }))}
                required
              />
            </Field>
            <Field htmlFor="booking-stay-type" label={t("stayTypeLabel")}>
              <Select
                defaultValue="guest"
                name="stayType"
                onValueChange={setStayType}
              >
                <SelectTrigger className="w-full" id="booking-stay-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guest">{t("stayType.guest")}</SelectItem>
                  <SelectItem value="resident">
                    {t("stayType.resident")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-1.5">
            <Field htmlFor="booking-dates" label={t("stayDates")}>
              <DateRangeField
                id="booking-dates"
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
                // A departure is a later night: a booking cannot end on the
                // day it starts.
                minSpan={1}
                names={{ from: "startsOn", to: "endsOn" }}
                onChange={setDates}
                required
                today={today}
              />
            </Field>
            <p className="text-step--1 text-muted-foreground">
              {t("departureHint")}
            </p>
          </div>

          {quote ? (
            // Polite: it changes as the Unit, the kind of stay and the dates
            // do, and each change is detail rather than an interruption.
            <p
              aria-live="polite"
              className="rounded-lg border bg-muted/40 px-3 py-2 text-step--1"
            >
              <bdi>{quote}</bdi>
            </p>
          ) : null}

          {message ? (
            // Polite rather than assertive: the dialog is still open and the
            // reader is in it, so this is detail rather than an interruption.
            <div aria-live="polite">
              <FormError>{message}</FormError>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("discardBooking")}
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit">
              {pending ? t("takingBooking") : t("takeBooking")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
