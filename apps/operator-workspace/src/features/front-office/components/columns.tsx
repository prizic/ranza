"use client";

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
import { unitLabel } from "../unit-label";
import { UndoCheckInDialog } from "./undo-check-in-dialog";
import { FrontDeskRowMenu } from "./row-menu";

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

const RESERVATION_TONE: Record<Arrival["status"], StatusTone> = {
  requested: "info",
  confirmed: "success",
  cancelled: "neutral",
  no_show: "danger",
  checked_in: "success",
  checked_out: "neutral",
};

const RESERVATION_ICON = {
  requested: CircleDashed,
  confirmed: CircleCheck,
  cancelled: CircleDashed,
  no_show: CircleDashed,
  checked_in: DoorOpen,
  checked_out: DoorClosed,
} as const;

export function useArrivalColumns(
  locale: SupportedLocale,
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
          <span className="font-mono tabular-nums font-medium">
            {row.original.reference}
          </span>
          {row.original.daysLate > 0 && row.original.status !== "checked_in" ? (
            <span className="block text-step--1 font-semibold text-warning">
              {t("daysLate", { n: row.original.daysLate })}
            </span>
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
      // What the room is doing for this arrival, from the same facts check-in
      // refuses on. "Vacant" rather than "ready": whether it has been cleaned
      // is the housekeeping lifecycle's to say, and nothing records it yet.
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
                  arrival.occupantOverdue
                    ? t("occupiedOverstay")
                    : t("occupiedDueOut")
                }
                tone="warning"
              />
            );
          case "unit_blocked":
            return (
              <StatusBadge icon={Ban} label={t("unitBlocked")} tone="danger" />
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
            return (
              <StatusBadge
                icon={CircleCheck}
                label={t("vacant")}
                tone="success"
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
      cell: ({ row }) => (
        <Balance
          currency={row.original.currency}
          locale={locale}
          minor={row.original.balanceMinor}
        />
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
            {!arrival.mayCheckIn ? null : arrival.canCheckIn ? (
              <CheckInAction
                locale={locale}
                reservationId={arrival.reservationId}
              />
            ) : arrival.stayId ? (
              <UndoCheckInDialog
                guestName={arrival.guestName}
                locale={locale}
                reservationId={arrival.reservationId}
                stayId={arrival.stayId}
                unitName={label}
              />
            ) : arrival.checkInBlocker ? (
              // Where the button would be, what stands in its way, so nobody
              // presses a button that is certain to be refused.
              <span className="max-w-48 text-end text-step--1 text-muted-foreground">
                {t(`checkInBlocked.${arrival.checkInBlocker}`)}
              </span>
            ) : null}
            <FrontDeskRowMenu
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
                    }
              }
              folioId={arrival.folioId}
              guestName={arrival.guestName}
              locale={locale}
            />
          </div>
        );
      },
    },
  ];
}

export function useDepartureColumns(
  locale: SupportedLocale,
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
          <span className="font-mono tabular-nums font-medium">
            {row.original.reference}
          </span>
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
            <CheckOutDialog departure={row.original} locale={locale} />
          ) : null}
          <FrontDeskRowMenu
            folioId={row.original.folioId}
            guestName={row.original.guestName || t("noGuestRecorded")}
            locale={locale}
          />
        </div>
      ),
    },
  ];
}

/**
 * The booking list.
 *
 * Every booking still ahead of the Property or under way, whatever became of
 * it. The one action here is cancelling a booking that has not arrived;
 * amending one and assigning a different Unit are blueprint 5.3 and not built,
 * so they are not offered.
 *
 * The Guest's email is under their name because it is the only visible evidence
 * that a returning Guest was recognized rather than duplicated. Two rows showing
 * one address are one person.
 */
export function useReservationColumns(
  locale: SupportedLocale,
): ColumnDef<ReservationRow, unknown>[] {
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
            {row.original.guestEmail ? (
              // Isolated, like every other piece of data in a sentence: an
              // address is Latin text and sits inside an Arabic column.
              <bdi>{row.original.guestEmail}</bdi>
            ) : (
              t(`stayType.${row.original.stayType}`)
            )}
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
        <span className="font-mono tabular-nums font-medium">
          {row.original.reference}
        </span>
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
      cell: ({ row }) => (
        <p className="whitespace-nowrap text-step--1">
          <time dateTime={row.original.startsOn}>
            {day(row.original.startsOn, locale)}
          </time>
          {row.original.endsOn ? (
            <>
              {" – "}
              <time dateTime={row.original.endsOn}>
                {day(row.original.endsOn, locale)}
              </time>
            </>
          ) : (
            <> · {t("openEnded")}</>
          )}
        </p>
      ),
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
      cell: ({ row }) =>
        row.original.mayCancel ? (
          <div className="flex justify-end">
            <FrontDeskRowMenu
              booking={{
                reservationId: row.original.reservationId,
                reference: row.original.reference,
                unitLabel: unitLabel(
                  row.original.roomName,
                  row.original.unitName,
                ),
                mayCancel: true,
                // A no-show is marked from the arrivals list, on the day.
                mayMarkNoShow: false,
              }}
              folioId={null}
              guestName={row.original.guestName}
              locale={locale}
            />
          </div>
        ) : null,
    },
  ];
}
