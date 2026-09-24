"use client";

import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Ban,
  CalendarClock,
  CircleCheck,
  CircleDashed,
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
import { CheckInAction, CheckOutAction } from "./check-in-action";
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

function shortRef(id: string): string {
  if (id.startsWith("RZ-")) return id;
  const clean = id.replace(/^(res_|stay_)/, "");
  return `RZ-${clean.slice(0, 6).toUpperCase()}`;
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
      id: "reservation",
      accessorKey: "reservationId",
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
            {shortRef(row.original.reservationId)}
          </span>
          {row.original.daysLate > 0 && row.original.status !== "checked_in" ? (
            <span className="block text-step--1 font-semibold text-warning">
              {t("daysLate", { n: row.original.daysLate })}
            </span>
          ) : row.original.status === "confirmed" && row.original.eta ? (
            <span className="block text-step--1 text-muted-foreground">
              {t("expectedEta", { eta: row.original.eta })}
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
      cell: ({ row }) =>
        row.original.unitName ? (
          <div>
            <span className="font-medium tabular-nums">
              {row.original.unitName}
            </span>
            <span className="block text-step--1 text-muted-foreground">
              {t(`unitType.${row.original.unitType}`)}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">{t("notAssigned")}</span>
        ),
    },
    {
      id: "readiness",
      accessorKey: "unitStatus",
      meta: { title: t("readiness") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={t("readiness")}
        />
      ),
      cell: ({ row }) =>
        row.original.status === "checked_in" ? (
          <StatusBadge icon={DoorOpen} label={t("checkedIn")} tone="success" />
        ) : row.original.unitStatus === "blocked" ? (
          <StatusBadge icon={Ban} label={t("blockedStatus")} tone="danger" />
        ) : row.original.unitStatus === "available" &&
          !row.original.unitIsReady ? (
          <StatusBadge icon={SprayCan} label={t("notReady")} tone="warning" />
        ) : row.original.unitStatus === "available" ? (
          <StatusBadge icon={CircleCheck} label={t("ready")} tone="success" />
        ) : row.original.unitStatus === "out_of_service" ? (
          <StatusBadge
            icon={CircleDashed}
            label={t("outOfOrder")}
            tone="danger"
          />
        ) : row.original.unitStatus === "occupied" ? (
          <StatusBadge
            icon={CircleDashed}
            label={t("occupied")}
            tone="warning"
          />
        ) : (
          <StatusBadge
            icon={CircleDashed}
            label={row.original.unitStatus}
            tone="neutral"
          />
        ),
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
      cell: ({ row }) => {
        const isDebt = row.original.balanceMinor > 0;
        const isCredit = row.original.balanceMinor < 0;
        const formatted = formatMoney(
          row.original.balanceMinor,
          row.original.currency,
          locale,
        );
        return (
          <div className="tabular-nums">
            <span
              className={
                isDebt
                  ? "font-semibold text-danger"
                  : isCredit
                    ? "font-semibold text-info"
                    : "font-normal"
              }
            >
              {formatted}
            </span>
            {isCredit && (
              <span className="block text-step--1 text-muted-foreground">
                {t("credit")}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "action",
      meta: { title: t("action") },
      enableHiding: false,
      header: () => <span className="sr-only">{t("action")}</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          {row.original.canCheckIn ? (
            <CheckInAction
              locale={locale}
              reservationId={row.original.reservationId}
            />
          ) : row.original.stayId ? (
            <UndoCheckInDialog
              guestName={row.original.guestName}
              locale={locale}
              reservationId={row.original.reservationId}
              stayId={row.original.stayId}
              unitName={row.original.unitName}
            />
          ) : null}
          <FrontDeskRowMenu
            guestName={row.original.guestName}
            locale={locale}
            reservationId={row.original.reservationId}
            stayId={row.original.stayId}
            unitId={row.original.unitId}
          />
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
      cell: ({ row }) => {
        const name = row.original.guestName || row.original.unitName;
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 text-step--1">
              <AvatarFallback>{initialsOf(name)}</AvatarFallback>
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
      id: "reservation",
      accessorKey: "stayId",
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
          {shortRef(row.original.stayId)}
        </span>
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
            {row.original.unitName}
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
      cell: ({ row }) =>
        row.original.overdue ? (
          <StatusBadge
            icon={CalendarClock}
            label={t("overdueSince", {
              date: day(row.original.endsOn, locale),
            })}
            tone="warning"
          />
        ) : (
          <StatusBadge icon={CircleCheck} label={t("today")} tone="neutral" />
        ),
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
      cell: ({ row }) => {
        const isDebt = row.original.balanceMinor > 0;
        const isCredit = row.original.balanceMinor < 0;
        const formatted = formatMoney(
          row.original.balanceMinor,
          row.original.currency,
          locale,
        );
        return (
          <div className="tabular-nums">
            <span
              className={
                isDebt
                  ? "font-semibold text-danger"
                  : isCredit
                    ? "font-semibold text-info"
                    : "font-normal"
              }
            >
              {formatted}
            </span>
            {isCredit && (
              <span className="block text-step--1 text-muted-foreground">
                {t("credit")}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "action",
      meta: { title: t("action") },
      enableHiding: false,
      header: () => <span className="sr-only">{t("action")}</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <CheckOutAction locale={locale} stayId={row.original.stayId} />
          <FrontDeskRowMenu
            guestName={row.original.guestName || row.original.unitName}
            locale={locale}
            reservationId={null}
            stayId={row.original.stayId}
            unitId={row.original.unitId}
          />
        </div>
      ),
    },
  ];
}

/**
 * The booking list.
 *
 * The same four columns as arrivals, minus the action: there is nothing to do
 * to a Reservation here yet. Cancelling, amending and assigning a different Unit
 * are all blueprint 5.3 and none of them is built, so a row action would be a
 * menu with nothing in it.
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
  ];
}
