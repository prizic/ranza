"use client";

import { useTranslations } from "next-intl";
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
import { useSortLabels } from "../../../lib/table-labels";
import { CheckInAction, CheckOutAction } from "./check-in-action";
import { UndoCheckInDialog } from "./undo-check-in-dialog";

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
        <div>
          <p className="font-medium">{row.original.guestName}</p>
          <p className="text-step--1 text-muted-foreground">
            {t(`stayType.${row.original.stayType}`)}
          </p>
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
            {row.original.unitName}
          </span>
          <span className="block text-step--1 text-muted-foreground">
            {t(`unitType.${row.original.unitType}`)}
          </span>
        </p>
      ),
    },
    {
      id: "action",
      meta: { title: t("action") },
      enableHiding: false,
      header: () => <span className="sr-only">{t("action")}</span>,
      cell: ({ row }) =>
        row.original.canCheckIn ? (
          <CheckInAction
            locale={locale}
            reservationId={row.original.reservationId}
          />
        ) : (
          <div className="flex items-center justify-end gap-1">
            <StatusBadge
              icon={RESERVATION_ICON[row.original.status]}
              label={t(`reservationStatus.${row.original.status}`)}
              tone={RESERVATION_TONE[row.original.status]}
            />
            {/* The badge stays, and the action sits beside it: a state that is
                only legible from the control offered next to it is a state
                carried by the control (blueprint 18.5).

                Offered on every row that still names an in-house Stay, not only
                on the ones that would succeed. Whether charges exist is
                answered by a trigger in the database for the reason ADR 0022
                gives, and asking the same question here to decide whether to
                draw a button would be the weaker of the two — and would hide
                the one refusal a front desk can act on. */}
            {row.original.stayId ? (
              <UndoCheckInDialog
                guestName={row.original.guestName}
                locale={locale}
                stayId={row.original.stayId}
                unitName={row.original.unitName}
              />
            ) : null}
          </div>
        ),
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
      cell: ({ row }) => (
        <div>
          <p className="font-medium">
            {/* A walk-in has no name recorded anywhere yet: Guest profiles are
                blueprint 5.3 and are not built. The Unit identifies them in the
                meantime, which is what the front desk would use anyway. */}
            {row.original.guestName || row.original.unitName}
          </p>
          <p className="text-step--1 text-muted-foreground">
            {t(`stayType.${row.original.stayType}`)}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "endsOn",
      meta: { title: t("departure") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("departure")}
        />
      ),
      cell: ({ row }) => (
        <StatusBadge
          icon={row.original.overdue ? CalendarClock : CircleCheck}
          // The date is in the label, so the tone is never the only carrier of
          // "this one is late" (blueprint 18.5).
          label={`${day(row.original.endsOn, locale)} · ${
            row.original.overdue ? t("overdue") : t("onTime")
          }`}
          tone={row.original.overdue ? "warning" : "neutral"}
        />
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
            {row.original.unitName}
          </span>
          <span className="block text-step--1 text-muted-foreground">
            {t(`unitType.${row.original.unitType}`)}
          </span>
        </p>
      ),
    },
    {
      id: "action",
      meta: { title: t("action") },
      enableHiding: false,
      header: () => <span className="sr-only">{t("action")}</span>,
      cell: ({ row }) => (
        <CheckOutAction locale={locale} stayId={row.original.stayId} />
      ),
    },
  ];
}
