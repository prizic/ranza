"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarClock,
  CircleCheck,
  CircleDashed,
  DoorOpen,
} from "lucide-react";
import type { Arrival, Departure } from "@ranza/reservations";
import { DataTableColumnHeader, StatusBadge, type StatusTone } from "@ranza/ui";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import type { Messages } from "../../../messages";
import { CheckInAction, CheckOutAction } from "./check-in-action";

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

const RESERVATION_TONE: Record<Arrival["status"], StatusTone> = {
  requested: "info",
  confirmed: "success",
  cancelled: "neutral",
  no_show: "danger",
  checked_in: "success",
};

const RESERVATION_ICON = {
  requested: CircleDashed,
  confirmed: CircleCheck,
  cancelled: CircleDashed,
  no_show: CircleDashed,
  checked_in: DoorOpen,
} as const;

function sortLabels(copy: Messages) {
  return {
    clearSort: copy.table.clearFilter,
    sortAscending: copy.table.next,
    sortDescending: copy.table.previous,
  };
}

export function arrivalColumns(
  copy: Messages,
  locale: SupportedLocale,
): ColumnDef<Arrival, unknown>[] {
  return [
    {
      accessorKey: "guestName",
      meta: { title: copy.guest },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sortLabels(copy)}
          title={copy.guest}
        />
      ),
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.guestName}</p>
          <p className="text-step--1 text-muted-foreground">
            {copy.stayType[row.original.stayType]}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "startsOn",
      meta: { title: copy.period },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sortLabels(copy)}
          title={copy.period}
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
            <> · {copy.openEnded}</>
          )}
        </p>
      ),
    },
    {
      accessorKey: "unitName",
      meta: { title: copy.unit },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sortLabels(copy)}
          title={copy.unit}
        />
      ),
      cell: ({ row }) => (
        <p>
          <span className="font-medium tabular-nums">
            {row.original.unitName}
          </span>
          <span className="block text-step--1 text-muted-foreground">
            {copy.unitType[row.original.unitType]}
          </span>
        </p>
      ),
    },
    {
      id: "action",
      meta: { title: copy.action },
      enableHiding: false,
      header: () => <span className="sr-only">{copy.action}</span>,
      cell: ({ row }) =>
        row.original.canCheckIn ? (
          <CheckInAction
            copy={copy}
            locale={locale}
            reservationId={row.original.reservationId}
          />
        ) : (
          <div className="flex justify-end">
            <StatusBadge
              icon={RESERVATION_ICON[row.original.status]}
              label={copy.reservationStatus[row.original.status]}
              tone={RESERVATION_TONE[row.original.status]}
            />
          </div>
        ),
    },
  ];
}

export function departureColumns(
  copy: Messages,
  locale: SupportedLocale,
): ColumnDef<Departure, unknown>[] {
  return [
    {
      accessorKey: "guestName",
      meta: { title: copy.guest },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sortLabels(copy)}
          title={copy.guest}
        />
      ),
      cell: ({ row }) => (
        <div>
          <p className="font-medium">
            {/* A walk-in has no name recorded anywhere yet: Guest profiles are
                blueprint 5.3 and are not built. The Unit identifies them in the
                meantime, which is what the front desk would use anyway. */}
            {row.original.guestName || row.original.unitName}
          </p>
          <p className="text-step--1 text-muted-foreground">
            {copy.stayType[row.original.stayType]}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "endsOn",
      meta: { title: copy.departure },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sortLabels(copy)}
          title={copy.departure}
        />
      ),
      cell: ({ row }) => (
        <StatusBadge
          icon={row.original.overdue ? CalendarClock : CircleCheck}
          // The date is in the label, so the tone is never the only carrier of
          // "this one is late" (blueprint 18.5).
          label={`${day(row.original.endsOn, locale)} · ${
            row.original.overdue ? copy.overdue : copy.onTime
          }`}
          tone={row.original.overdue ? "warning" : "neutral"}
        />
      ),
    },
    {
      accessorKey: "unitName",
      meta: { title: copy.unit },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sortLabels(copy)}
          title={copy.unit}
        />
      ),
      cell: ({ row }) => (
        <p>
          <span className="font-medium tabular-nums">
            {row.original.unitName}
          </span>
          <span className="block text-step--1 text-muted-foreground">
            {copy.unitType[row.original.unitType]}
          </span>
        </p>
      ),
    },
    {
      id: "action",
      meta: { title: copy.action },
      enableHiding: false,
      header: () => <span className="sr-only">{copy.action}</span>,
      cell: ({ row }) => (
        <CheckOutAction
          copy={copy}
          locale={locale}
          stayId={row.original.stayId}
        />
      ),
    },
  ];
}
