"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
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
import { usePickerLabels } from "../../../lib/table-labels";
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
 * Dates are `<input type="date">`. The browser already knows the reader's
 * calendar, their locale's ordering and how to be operated from a keyboard, and
 * it submits `YYYY-MM-DD` — which is what the module wants and what the database
 * stores. A picker component would be a worse version of all four.
 */

/**
 * `GUEST_DETAILS` in `@ranza/guests`, restated rather than imported: nothing
 * outside `src/server/` may import a Ranza module, and that rule has a fixture
 * proving it fires (ADR 0007). `tests/unit/new-reservation.test.ts` fails if
 * these ever disagree with the module, which is the only thing the import would
 * have bought.
 */
const GUEST = { name: 120, email: 254, phone: 40 };

export function NewReservationDialog({
  locale,
  propertyId,
  units,
}: {
  locale: string;
  propertyId: string;
  units: readonly BookableUnit[];
}) {
  const t = useTranslations();
  const unitLabels = usePickerLabels(t("chooseUnit"));
  const [open, setOpen] = useState(false);
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
    <Dialog onOpenChange={setOpen} open={open}>
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
                options={units.map((unit) => ({
                  value: unit.unitId,
                  label: unitLabel(unit.roomName, unit.unitName),
                  description: t(`unitType.${unit.unitType}`),
                }))}
                required
              />
            </Field>
            <Field htmlFor="booking-stay-type" label={t("stayTypeLabel")}>
              <Select defaultValue="guest" name="stayType">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="booking-starts" label={t("arrival")}>
              <Input id="booking-starts" name="startsOn" required type="date" />
            </Field>
            <div className="grid gap-1.5">
              <Field htmlFor="booking-ends" label={t("departure")}>
                <Input
                  aria-describedby="booking-ends-hint"
                  id="booking-ends"
                  name="endsOn"
                  type="date"
                />
              </Field>
              <p
                className="text-step--1 text-muted-foreground"
                id="booking-ends-hint"
              >
                {t("departureHint")}
              </p>
            </div>
          </div>

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
