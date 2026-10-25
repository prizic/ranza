"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Ban,
  LogIn,
  LogOut,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { HousekeepingRoom, HousekeepingStatus } from "@ranza/housekeeping";
import {
  cn,
  DataTableColumnHeader,
  DataTableRowActions,
  StatusBadge,
  type StatusTone,
} from "@ranza/ui";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import { useSortLabels } from "../../../lib/table-labels";
import type { RoomDay } from "../../../server/housekeeping-day";
import { HousekeepingStatusBadge, STATUS_LOOK } from "./status";

const MARKS: readonly HousekeepingStatus[] = ["clean", "inspected", "dirty"];

const MARK_LABEL = {
  clean: "markClean",
  inspected: "markInspected",
  dirty: "markDirty",
} as const satisfies Record<HousekeepingStatus, string>;

/** How each thing the day asks of a room reads, and where it ranks. */
const DAY_LOOK: Record<
  RoomDay,
  { icon: LucideIcon; tone: StatusTone; label: string; rank: number }
> = {
  arrival: {
    icon: LogIn,
    tone: "danger",
    label: "priorityArrival",
    rank: 0,
  },
  inspect_for_arrival: {
    icon: Sparkles,
    tone: "warning",
    label: "priorityInspect",
    rank: 1,
  },
  leaving: {
    icon: LogOut,
    tone: "info",
    label: "priorityLeaving",
    rank: 2,
  },
  arriving: {
    icon: LogIn,
    tone: "neutral",
    label: "priorityArrival",
    rank: 3,
  },
};

const NO_DAY_RANK = 4;

/** The floor as a filter value, so a room with none can be picked too. */
export const NO_FLOOR = "none";

export const floorValue = (floor: number | null) =>
  floor === null ? NO_FLOOR : String(floor);

/**
 * When the status last changed, in the Property's own time zone: a desk in
 * Istanbul reading a board from a laptop set to London must see 14:05, not
 * 12:05. The year is shown once it is not this one, so an old mark does not
 * read as a recent one.
 */
function changedAt(iso: string, locale: SupportedLocale, timeZone: string) {
  const changed = new Date(iso);
  return formatDate(changed, locale, {
    year:
      changed.getUTCFullYear() === new Date().getUTCFullYear()
        ? undefined
        : "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
}

/**
 * Whether somebody is in the room: the answer to "do I knock". One drawing for
 * the Occupancy column and for the room cell a phone reads instead of it.
 */
function OccupancyBadge({ room }: { room: HousekeepingRoom }) {
  const t = useTranslations("housekeeping");
  return room.outOfService ? (
    <StatusBadge icon={Ban} label={t("outOfService")} tone="neutral" />
  ) : room.inHouse ? (
    <StatusBadge icon={Users} label={t("inHouse")} tone="info" />
  ) : (
    <span className="text-muted-foreground">{t("vacant")}</span>
  );
}

function DayBadge({ day }: { day: RoomDay | undefined }) {
  const t = useTranslations("housekeeping");
  if (!day) return null;
  const look = DAY_LOOK[day];
  return (
    <StatusBadge
      icon={look.icon}
      label={t(look.label as "priorityArrival")}
      tone={look.tone}
    />
  );
}

export function useHousekeepingColumns({
  locale,
  timeZone,
  days,
  mayMark,
  pending,
  reportHref,
  onMark,
}: {
  locale: SupportedLocale;
  timeZone: string;
  /** What the day asks of each room, by Unit id (HK-04). */
  days: Readonly<Record<string, RoomDay>>;
  mayMark: boolean;
  pending: boolean;
  /** Where to report a problem in a room, up to its id; null if not allowed. */
  reportHref: string | null;
  onMark: (unitIds: string[], status: HousekeepingStatus) => void;
}): ColumnDef<HousekeepingRoom>[] {
  const t = useTranslations("housekeeping");
  const sort = useSortLabels();
  const router = useRouter();

  // The same array while nothing it draws has changed. The table renders a
  // cell as a component, so a new function each render remounts every row's
  // menu: an open menu closed under the finger on the next render.
  return useMemo(() => {
    const columns: ColumnDef<HousekeepingRoom>[] = [
      {
        accessorKey: "name",
        meta: { title: t("room") },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            labels={sort}
            title={t("room")}
          />
        ),
        cell: ({ row }) => (
          <div>
            <span className="block font-medium">{row.original.name}</span>
            {row.original.bedCount > 0 ? (
              <span className="block text-step--1 text-muted-foreground">
                {t("beds", { count: row.original.bedCount })}
              </span>
            ) : null}
            {/* With a menu on the row, a phone reaches this from there: a grey
              line set against the tick and the room number was a target a
              thumb aiming at either could open instead (HOUSEKEEPING-06). */}
            {reportHref ? (
              <Link
                className={cn(
                  "mt-1 block text-step--1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline pointer-coarse:py-3",
                  mayMark && "max-md:hidden",
                )}
                href={`${reportHref}${row.original.unitId}`}
                prefetch={false}
              >
                {t("reportProblem")}
              </Link>
            ) : null}
            {/* On a phone the status column is a swipe away, and the status is
              what this screen is for: it is said under the room as well, with
              whether anybody is in it, which decides whether to knock
              (HOUSEKEEPING-04). */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 md:hidden">
              <HousekeepingStatusBadge status={row.original.status} />
              <DayBadge day={days[row.original.unitId]} />
              <OccupancyBadge room={row.original} />
            </div>
          </div>
        ),
      },
      {
        accessorKey: "building",
        meta: { title: t("location") },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            labels={sort}
            title={t("location")}
          />
        ),
        cell: ({ row }) => {
          const parts = [
            row.original.building,
            row.original.floor === null
              ? null
              : t("floorNumber", { floor: row.original.floor }),
          ].filter((part): part is string => part !== null);
          return parts.length > 0 ? (
            parts.join(" · ")
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "floor",
        accessorFn: (room) => floorValue(room.floor),
        meta: { title: t("floorFilter") },
        enableHiding: false,
        enableSorting: false,
        filterFn: (row, id, value: string[]) =>
          value.length === 0 || value.includes(row.getValue<string>(id)),
      },
      {
        id: "today",
        accessorFn: (room) => {
          const day = days[room.unitId];
          return day ? DAY_LOOK[day].rank : NO_DAY_RANK;
        },
        meta: { title: t("todayColumn") },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            labels={sort}
            title={t("todayColumn")}
          />
        ),
        cell: ({ row }) =>
          days[row.original.unitId] ? (
            <DayBadge day={days[row.original.unitId]} />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "status",
        meta: { title: t("status") },
        // The status facet hands over the ticked values; a room matches when its
        // status is one of them.
        filterFn: (row, id, value: string[]) =>
          value.length === 0 || value.includes(row.getValue<string>(id)),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            labels={sort}
            title={t("status")}
          />
        ),
        // Clean and not ready means inspection applies here: the badge alone
        // would call two rooms the same that the front desk must treat
        // differently.
        cell: ({ row }) => (
          <div className="grid justify-items-start gap-1">
            <HousekeepingStatusBadge status={row.original.status} />
            {row.original.status === "clean" && !row.original.ready ? (
              <span className="text-step--1 text-muted-foreground">
                {t("awaitingInspection")}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "occupancy",
        accessorKey: "inHouse",
        meta: { title: t("occupancy") },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            labels={sort}
            title={t("occupancy")}
          />
        ),
        cell: ({ row }) => <OccupancyBadge room={row.original} />,
      },
      {
        accessorKey: "changedAt",
        meta: { title: t("changed") },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            labels={sort}
            title={t("changed")}
          />
        ),
        cell: ({ row }) =>
          row.original.changedAt === null ? (
            <span className="text-muted-foreground">{t("neverMarked")}</span>
          ) : (
            <span className="tabular-nums">
              {changedAt(row.original.changedAt, locale, timeZone)}
            </span>
          ),
      },
    ];

    if (!mayMark) return columns;

    return [
      ...columns,
      {
        id: "actions",
        meta: { pinEnd: true },
        enableHiding: false,
        enableSorting: false,
        header: () => <span className="sr-only">{t("actions")}</span>,
        cell: ({ row }) =>
          pending ? null : (
            <DataTableRowActions
              actions={[
                ...MARKS.filter((status) => status !== row.original.status).map(
                  (status) => ({
                    label: t(MARK_LABEL[status]),
                    icon: STATUS_LOOK[status].icon,
                    onSelect: () => onMark([row.original.unitId], status),
                  }),
                ),
                ...(reportHref
                  ? [
                      {
                        label: t("reportProblem"),
                        icon: Wrench,
                        onSelect: () =>
                          router.push(`${reportHref}${row.original.unitId}`),
                      },
                    ]
                  : []),
              ]}
              label={t("roomActions", { room: row.original.name })}
            />
          ),
      },
    ];
  }, [
    days,
    locale,
    mayMark,
    onMark,
    pending,
    reportHref,
    router,
    sort,
    t,
    timeZone,
  ]);
}

export { MARK_LABEL, MARKS };
