"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Ban,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  DoorClosed,
  DoorOpen,
  SprayCan,
} from "lucide-react";
import type { Arrival, Departure, ReservationRow } from "@ranza/reservations";
import {
  Avatar,
  AvatarFallback,
  DataTableColumnHeader,
  StatusBadge,
  type StatusTone,
} from "@ranza/ui";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import { useSortLabels } from "../../../lib/table-labels";
import { CheckInAction } from "./check-in-action";
import { CheckOutDialog } from "./check-out-dialog";
import { expectedArrivalLabel } from "../expected-arrival";
import { unitLabel } from "../unit-label";
import { UndoCheckInDialog } from "./undo-check-in-dialog";
import { FrontDeskRowMenu } from "./row-menu";
import { CopyReferenceButton } from "./copy-reference-button";

/**
 * `meta.title` is not decoration: the column menu and the search placeholder
 * both read it, so a column without one is a column the reader cannot name.
 */

/**
 * A calendar date, not an instant, so it is parsed and formatted in UTC.
 * Anything else shifts the date by a day for a reader west of the meridian and
 * shows them the wrong arrival.
 */
function day(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * A balance as the desk reads it: owed in red, a credit in blue and said so.
 */
function Balance({
  minor,
  currency,
  locale,
}: {
  minor: number;
  currency: string;
  locale: SupportedLocale;
}) {
  const t = useTranslations();
  return (
    <div className="tabular-nums">
      <span
        className={
          minor > 0
            ? "font-semibold text-danger"
            : minor < 0
              ? "font-semibold text-info"
              : "font-normal"
        }
      >
        {formatMoney(minor, currency, locale)}
      </span>
      {minor < 0 ? (
        <span className="block text-step--1 text-muted-foreground">
          {t("credit")}
        </span>
      ) : null}
    </div>
  );
}

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/).filter(Boolean);
  const firstWord = words[0];
  if (!firstWord) return "?";
  if (words.length === 1) {
    return Array.from(firstWord).slice(0, 2).join("").toUpperCase();
  }
  const lastWord = words[words.length - 1];
  const first = Array.from(firstWord)[0] ?? "";
  const last = lastWord ? (Array.from(lastWord)[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export const RESERVATION_TONE: Record<Arrival["status"], StatusTone> = {
  requested: "info",
  confirmed: "success",
  cancelled: "neutral",
  no_show: "danger",
  checked_in: "success",
  checked_out: "neutral",
};

export const RESERVATION_ICON = {
  requested: CircleDashed,
  confirmed: CircleCheck,
  cancelled: CircleDashed,
  no_show: CircleDashed,
  checked_in: DoorOpen,
  checked_out: DoorClosed,
} as const;

/**
 * When the Guest said they would arrive, under the reference, and a word when
 * the Property's clock has passed it. A dash that a screen reader names when
 * nobody said. Not shown once the Guest is in: the time is moot then.
 */
function ExpectedArrival({
  arrival,
  locale,
}: {
  arrival: Arrival;
  locale: SupportedLocale;
}) {
  const t = useTranslations();
  if (arrival.expectedArrival === null) {
    return (
      <span className="block text-step--1 text-muted-foreground">
        <span aria-hidden="true">{t("expectedAt", { time: "\u2014" })}</span>
        <span className="sr-only">{t("expectedArrivalNone")}</span>
      </span>
    );
  }
  return (
    <>
      <span className="block text-step--1 text-muted-foreground tabular-nums">
        {t("expectedAt", {
          time: expectedArrivalLabel(arrival.expectedArrival, locale),
        })}
      </span>
      {arrival.expectedArrivalPassed ? (
        <span className="block text-step--1 font-semibold text-warning">
          {t("expectedArrivalPassed")}
        </span>
      ) : null}
    </>
  );
}

export function useArrivalColumns(
  locale: SupportedLocale,
  propertyId: string,
): ColumnDef<Arrival, unknown>[] {
  const t = useTranslations();
  const sort = useSortLabels();
  return [
    {
      accessorKey: "guestName",
      meta: { title: t("guest") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("guest")}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 text-step--1">
            <AvatarFallback>
              {initialsOf(row.original.guestName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium leading-none">
              <bdi>{row.original.guestName}</bdi>
            </p>
            <p className="mt-1 text-step--1 text-muted-foreground">
              {t(`stayType.${row.original.stayType}`)}
              {", "}
              {row.original.endsOn
                ? t("untilDate", { date: day(row.original.endsOn, locale) })
                : t("openEnded")}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "reference",
      meta: { title: t("reservation") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("reservation")}
        />
      ),
      cell: ({ row }) => (
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono tabular-nums font-medium">
              {row.original.reference}
            </span>
            <CopyReferenceButton reference={row.original.reference} />
          </div>
          {row.original.daysLate > 0 && row.original.status !== "checked_in" ? (
            <span className="block text-step--1 font-semibold text-warning">
              {t("daysLate", { n: row.original.daysLate })}
            </span>
          ) : null}
          {row.original.status !== "checked_in" ? (
            <ExpectedArrival arrival={row.original} locale={locale} />
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "unitName",
      meta: { title: t("roomAndBed") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("roomAndBed")}
        />
      ),
      cell: ({ row }) => (
        <div>
          <span className="font-medium tabular-nums">
            <bdi>{unitLabel(row.original.roomName, row.original.unitName)}</bdi>
          </span>
          <span className="block text-step--1 text-muted-foreground">
            {t(`unitType.${row.original.unitType}`)}
          </span>
        </div>
      ),
    },
    {
      id: "readiness",
      accessorKey: "checkInBlocker",
      meta: { title: t("readiness") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("readiness")}
        />
      ),
      // What the room is doing for this arrival: first whatever check-in
      // refuses on, from the same facts; then housekeeping's answer, which
      // is asked about at check-in and never refused (ADR 0029).
      cell: ({ row }) => {
        const arrival = row.original;
        if (arrival.status === "checked_in") {
          return (
            <StatusBadge
              icon={DoorOpen}
              label={t("checkedIn")}
              tone="success"
            />
          );
        }
        switch (arrival.checkInBlocker) {
          case "unit_occupied":
            return (
              <StatusBadge
                icon={CircleAlert}
                label={
                  arrival.occupantLeaves === "overdue"
                    ? t("occupiedOverstay")
                    : arrival.occupantLeaves === "today"
                      ? t("occupiedDueOut")
                      : t("occupied")
                }
                tone="warning"
              />
            );
          case "unit_blocked":
            return (
              <StatusBadge
                icon={Ban}
                label={t("blockedStatus")}
                tone="danger"
              />
            );
          case "unit_out_of_service":
            return (
              <StatusBadge icon={Ban} label={t("outOfOrder")} tone="danger" />
            );
          case "not_confirmed":
            return (
              <StatusBadge
                icon={CircleDashed}
                label={t("awaitingConfirmation")}
                tone="info"
              />
            );
          default:
            return arrival.unitIsReady ? (
              <StatusBadge
                icon={CircleCheck}
                label={t("ready")}
                tone="success"
              />
            ) : (
              <StatusBadge
                icon={SprayCan}
                label={t("notReady")}
                tone="warning"
              />
            );
        }
      },
    },
    {
      id: "balance",
      accessorKey: "balanceMinor",
      meta: { title: t("balance") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("balance")}
        />
      ),
      // Before check-in there is no bill, and a zero would claim there is one.
      cell: ({ row }) =>
        row.original.folioId ? (
          <Balance
            currency={row.original.currency}
            locale={locale}
            minor={row.original.balanceMinor}
          />
        ) : (
          <span className="text-muted-foreground">{t("noFolio")}</span>
        ),
    },
    {
      id: "action",
      meta: { title: t("action") },
      enableHiding: false,
      header: () => <span className="sr-only">{t("action")}</span>,
      cell: ({ row }) => {
        const arrival = row.original;
        const label = unitLabel(arrival.roomName, arrival.unitName);
        return (
          <div className="flex items-center justify-end gap-1">
            {arrival.canCheckIn && arrival.mayCheckIn ? (
              <CheckInAction
                locale={locale}
                reservationId={arrival.reservationId}
              />
            ) : arrival.stayId && arrival.mayCheckIn ? (
              <UndoCheckInDialog
                guestName={arrival.guestName}
                locale={locale}
                reservationId={arrival.reservationId}
                stayId={arrival.stayId}
                unitName={label}
              />
            ) : arrival.checkInBlocker ? (
              // Where the button would be, what stands in its way, so nobody
              // presses a button that is certain to be refused. Shown to
              // anybody reading the row: it is information, not a control.
              <span className="max-w-48 whitespace-normal text-end text-step--1 text-muted-foreground">
                {t(`checkInBlocked.${arrival.checkInBlocker}`)}
              </span>
            ) : null}
            <FrontDeskRowMenu
              key={arrival.reservationId}
              booking={
                arrival.status === "checked_in"
                  ? undefined
                  : {
                      reservationId: arrival.reservationId,
                      reference: arrival.reference,
                      unitLabel: label,
                      mayCancel: arrival.mayCancel,
                      // Every row not checked in on this list has reached its
                      // first night, so a confirmed one may be marked a no-show.
                      mayMarkNoShow:
                        arrival.mayCancel && arrival.status === "confirmed",
                      // An early or late arrival is moved here: to today, or
                      // to the nights the Guest now wants (AB-S1-09).
                      change: arrival.mayAmend
                        ? {
                            reservationId: arrival.reservationId,
                            reference: arrival.reference,
                            guestName: arrival.guestName,
                            unitLabel: label,
                            unitId: arrival.unitId,
                            startsOn: arrival.startsOn,
                            endsOn: arrival.endsOn,
                            expectedArrival: arrival.expectedArrival,
                          }
                        : undefined,
                    }
              }
              folioId={arrival.folioId}
              guestName={arrival.guestName}
              locale={locale}
              propertyId={propertyId}
              unitId={arrival.unitId}
            />
          </div>
        );
      },
    },
  ];
}

export function useDepartureColumns(
  locale: SupportedLocale,
  propertyId: string,
): ColumnDef<Departure, unknown>[] {
  const t = useTranslations();
  const sort = useSortLabels();
  return [
    {
      accessorKey: "guestName",
      meta: { title: t("guest") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("guest")}
        />
      ),
      cell: ({ row }) => {
        const name = row.original.guestName || t("noGuestRecorded");
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 text-step--1">
              <AvatarFallback>
                {initialsOf(row.original.guestName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium leading-none">
                <bdi>{name}</bdi>
              </p>
              <p className="mt-1 text-step--1 text-muted-foreground">
                {t(`stayType.${row.original.stayType}`)}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "reference",
      meta: { title: t("reservation") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("reservation")}
        />
      ),
      cell: ({ row }) =>
        row.original.reference ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono tabular-nums font-medium">
              {row.original.reference}
            </span>
            <CopyReferenceButton reference={row.original.reference} />
          </div>
        ) : (
          <span className="text-muted-foreground">{t("walkIn")}</span>
        ),
    },
    {
      accessorKey: "unitName",
      meta: { title: t("roomAndBed") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("roomAndBed")}
        />
      ),
      cell: ({ row }) => (
        <p>
          <span className="font-medium tabular-nums">
            <bdi>{unitLabel(row.original.roomName, row.original.unitName)}</bdi>
          </span>
          <span className="block text-step--1 text-muted-foreground">
            {t(`unitType.${row.original.unitType}`)}
          </span>
        </p>
      ),
    },
    {
      id: "leaves",
      accessorKey: "endsOn",
      meta: { title: t("leaves") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("leaves")}
        />
      ),
      cell: ({ row }) => {
        const { endsOn, overdue, early } = row.original;
        if (!endsOn) {
          return (
            <StatusBadge
              icon={CalendarClock}
              label={t("openEnded")}
              tone="neutral"
            />
          );
        }
        if (overdue) {
          return (
            <StatusBadge
              icon={CalendarClock}
              label={t("overdueSince", { date: day(endsOn, locale) })}
              tone="warning"
            />
          );
        }
        if (early) {
          return (
            <StatusBadge
              icon={CalendarClock}
              label={t("plannedFor", { date: day(endsOn, locale) })}
              tone="neutral"
            />
          );
        }
        return (
          <StatusBadge icon={CircleCheck} label={t("today")} tone="neutral" />
        );
      },
    },
    {
      id: "balance",
      accessorKey: "balanceMinor",
      meta: { title: t("balance") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("balance")}
        />
      ),
      cell: ({ row }) =>
        row.original.folioId ? (
          <Balance
            currency={row.original.currency}
            locale={locale}
            minor={row.original.balanceMinor}
          />
        ) : (
          <span className="text-muted-foreground">{t("noFolio")}</span>
        ),
    },
    {
      id: "action",
      meta: { title: t("action") },
      enableHiding: false,
      header: () => <span className="sr-only">{t("action")}</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          {row.original.mayCheckOut ? (
            // Keyed by the Stay, so a dialog can never outlive the row it
            // was opened on and submit for whichever row took its place.
            <CheckOutDialog
              departure={row.original}
              key={row.original.stayId}
              locale={locale}
              propertyId={propertyId}
            />
          ) : null}
          <FrontDeskRowMenu
            folioId={row.original.folioId}
            guestName={row.original.guestName || t("noGuestRecorded")}
            key={row.original.stayId}
            locale={locale}
            propertyId={propertyId}
            stay={
              row.original.mayAmend
                ? {
                    stayId: row.original.stayId,
                    reference: row.original.reference,
                    guestName: row.original.guestName || t("noGuestRecorded"),
                    unitLabel: unitLabel(
                      row.original.roomName,
                      row.original.unitName,
                    ),
                    startsOn: row.original.startsOn,
                    endsOn: row.original.endsOn,
                  }
                : undefined
            }
            unitId={row.original.unitId}
          />
        </div>
      ),
    },
  ];
}

/**
 * A booking as the list searches it: the Guest's telephone with only its digits,
 * because the search compares text and a number is typed without the spaces and
 * brackets it was written with.
 */
export type ReservationListRow = ReservationRow & {
  guestPhoneDigits: string;
  unitTypeLabel?: string;
  statusLabel?: string;
  dateSearch?: string;
};

/**
 * The booking list.
 *
 * Every booking still ahead of the Property or under way, whatever became of
 * it. A booking that has not arrived can be changed — its nights, its Unit —
 * or cancelled, from the row's menu (ADR 0039).
 *
 * The Guest's email is under their name because it is the only visible evidence
 * that a returning Guest was recognized rather than duplicated. Two rows showing
 * one address are one person.
 */
export function useReservationColumns(
  locale: SupportedLocale,
  propertyId: string,
  today?: string | null,
): ColumnDef<ReservationListRow, unknown>[] {
  const t = useTranslations();
  const sort = useSortLabels();
  return [
    {
      accessorKey: "guestName",
      meta: { title: t("guest") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("guest")}
        />
      ),
      cell: ({ row }) => (
        <div>
          <p className="font-medium">
            <bdi>{row.original.guestName}</bdi>
          </p>
          <p className="text-step--1 text-muted-foreground">
            {row.original.guestEmail || row.original.guestPhone
              ? // Isolated, like every other piece of data in a sentence: an
                // address and a number are Latin text and sit inside an Arabic
                // column.
                [row.original.guestEmail, row.original.guestPhone]
                  .filter((detail) => detail !== null && detail !== "")
                  .map((detail, index) => (
                    <Fragment key={detail}>
                      {index > 0 ? " · " : null}
                      <bdi>{detail}</bdi>
                    </Fragment>
                  ))
              : t(`stayType.${row.original.stayType}`)}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "reference",
      meta: { title: t("reservation") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("reservation")}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono tabular-nums font-medium">
            {row.original.reference}
          </span>
          <CopyReferenceButton reference={row.original.reference} />
        </div>
      ),
    },
    {
      accessorKey: "startsOn",
      meta: { title: t("period") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("period")}
        />
      ),
      cell: ({ row }) => {
        const { endsOn, startsOn, stayStartsOn, status } = row.original;
        const inHouse = status === "checked_in";
        const isDueToday = inHouse && today && endsOn === today;
        const isOverdue = inHouse && today && endsOn && endsOn < today;

        return (
          <div>
            <p className="whitespace-nowrap text-step--1">
              {/* A late arrival's Stay began after the booking said it would, and
                  the total beside this is over the nights the Stay has, so the
                  period starts where the Stay did. */}
              <time dateTime={stayStartsOn ?? startsOn}>
                {day(stayStartsOn ?? startsOn, locale)}
              </time>
              {endsOn ? (
                <>
                  {" – "}
                  <time dateTime={endsOn}>{day(endsOn, locale)}</time>
                </>
              ) : (
                <> · {t("openEnded")}</>
              )}
            </p>
            {isDueToday ? (
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-warning/15 px-1.5 py-0.5 text-step--2 font-medium text-warning-foreground">
                <CalendarClock className="size-3" />
                {t("dueToday")}
              </span>
            ) : isOverdue ? (
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-destructive/15 px-1.5 py-0.5 text-step--2 font-medium text-destructive">
                <CalendarClock className="size-3" />
                {t("overdueSince", { date: day(endsOn, locale) })}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "unitName",
      meta: { title: t("unit") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("unit")}
        />
      ),
      cell: ({ row }) => (
        <p>
          <span className="font-medium tabular-nums">
            <bdi>{unitLabel(row.original.roomName, row.original.unitName)}</bdi>
          </span>
          <span className="block text-step--1 text-muted-foreground">
            {t(`unitType.${row.original.unitType}`)}
          </span>
        </p>
      ),
    },
    {
      // The price each booking was taken at (ADR 0038), not today's list: a
      // price changed since does not change what these Guests are charged. The
      // total is that rate over the nights the stay has, which is what the desk
      // quotes; the rate itself stays beneath it, exactly as it was stamped.
      accessorKey: "totalMinor",
      meta: { title: t("priceColumn") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("priceColumn")}
        />
      ),
      cell: ({ row }) => {
        const { nightlyRateMinor, rateCurrency, stayNights, totalMinor } =
          row.original;
        if (nightlyRateMinor === null || rateCurrency === null) {
          return (
            <span className="text-step--1 text-muted-foreground">
              {t("bookedUnpriced")}
            </span>
          );
        }
        return (
          <p className="whitespace-nowrap text-step--1 tabular-nums">
            {totalMinor !== null && stayNights !== null ? (
              <span className="block font-medium">
                <bdi>
                  {t("quoteStay", {
                    count: stayNights,
                    total: formatMoney(totalMinor, rateCurrency, locale),
                  })}
                </bdi>
              </span>
            ) : null}
            <span
              className={
                totalMinor !== null ? "block text-muted-foreground" : undefined
              }
            >
              <bdi>
                {t("bookedPerNight", {
                  price: formatMoney(nightlyRateMinor, rateCurrency, locale),
                })}
              </bdi>
            </span>
          </p>
        );
      },
    },
    {
      accessorKey: "status",
      meta: { title: t("status") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("status")}
        />
      ),
      cell: ({ row }) => (
        <StatusBadge
          icon={RESERVATION_ICON[row.original.status]}
          label={t(`reservationStatus.${row.original.status}`)}
          tone={RESERVATION_TONE[row.original.status]}
        />
      ),
    },
    {
      id: "action",
      meta: { title: t("action") },
      enableHiding: false,
      header: () => <span className="sr-only">{t("action")}</span>,
      cell: ({ row }) => {
        const booking = row.original;
        const label = unitLabel(booking.roomName, booking.unitName);
        const inHouse = booking.stayId !== null;
        const menu =
          booking.mayCancel || booking.mayAmend || booking.mayChangeStay;
        return (
          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
            {booking.mayCheckIn ? (
              <CheckInAction
                locale={locale}
                reservationId={booking.reservationId}
              />
            ) : booking.checkInBlocker ? (
              // Where the button would be, what stands in its way, so nobody
              // presses a button that is certain to be refused. Shown to
              // anybody reading the row: it is information, not a control.
              <span className="max-w-48 whitespace-normal text-end text-step--1 text-muted-foreground">
                {t(`checkInBlocked.${booking.checkInBlocker}`)}
              </span>
            ) : null}
            {booking.mayUndoCheckIn && booking.stayId ? (
              // Where the button that just checked them in was: Check in has no
              // confirmation because the way back is on the same row.
              <UndoCheckInDialog
                guestName={booking.guestName}
                locale={locale}
                reservationId={booking.reservationId}
                stayId={booking.stayId}
                unitName={label}
              />
            ) : null}
            {menu || booking.folioId || booking.unitId ? (
              <FrontDeskRowMenu
                key={booking.reservationId}
                booking={
                  inHouse
                    ? undefined
                    : {
                        reservationId: booking.reservationId,
                        reference: booking.reference,
                        unitLabel: label,
                        mayCancel: booking.mayCancel,
                        // Here as well as on arrivals: a booking whose nights
                        // all passed unarrived is only on this list, and it is
                        // marked a no-show the morning after.
                        mayMarkNoShow: booking.mayMarkNoShow,
                        change: booking.mayAmend
                          ? {
                              reservationId: booking.reservationId,
                              reference: booking.reference,
                              guestName: booking.guestName,
                              unitLabel: label,
                              unitId: booking.unitId,
                              startsOn: booking.startsOn,
                              endsOn: booking.endsOn,
                              expectedArrival: booking.expectedArrival,
                            }
                          : undefined,
                      }
                }
                folioId={booking.folioId}
                guestName={booking.guestName}
                locale={locale}
                propertyId={propertyId}
                stay={
                  booking.stayId &&
                  booking.stayStartsOn &&
                  booking.mayChangeStay
                    ? {
                        stayId: booking.stayId,
                        reference: booking.reference,
                        guestName: booking.guestName,
                        unitLabel: label,
                        startsOn: booking.stayStartsOn,
                        endsOn: booking.endsOn,
                      }
                    : undefined
                }
                unitId={booking.unitId}
              />
            ) : null}
          </div>
        );
      },
    },
  ];
}
