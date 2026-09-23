"use client";

import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Users } from "lucide-react";
import type { HousekeepingRoom, HousekeepingStatus } from "@ranza/housekeeping";
import {
  DataTableColumnHeader,
  DataTableRowActions,
  StatusBadge,
} from "@ranza/ui";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import { useSortLabels } from "../../../lib/table-labels";
import { HousekeepingStatusBadge, STATUS_LOOK } from "./status";

const MARKS: readonly HousekeepingStatus[] = ["clean", "inspected", "dirty"];

const MARK_LABEL = {
  clean: "markClean",
  inspected: "markInspected",
  dirty: "markDirty",
} as const satisfies Record<HousekeepingStatus, string>;

/**
 * When the status last changed, in the Property's own time zone: a desk in
 * Istanbul reading a board from a laptop set to London must see 14:05, not
 * 12:05.
 */
function changedAt(iso: string, locale: SupportedLocale, timeZone: string) {
  return formatDate(new Date(iso), locale, {
    year: undefined,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
}

export function useHousekeepingColumns({
  locale,
  timeZone,
  mayMark,
  pending,
  onMark,
}: {
  locale: SupportedLocale;
  timeZone: string;
  mayMark: boolean;
  pending: boolean;
  onMark: (unitIds: string[], status: HousekeepingStatus) => void;
}): ColumnDef<HousekeepingRoom>[] {
  const t = useTranslations("housekeeping");
  const sort = useSortLabels();

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
      cell: ({ row }) => (
        <HousekeepingStatusBadge status={row.original.status} />
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
      cell: ({ row }) =>
        row.original.outOfService ? (
          <StatusBadge icon={Ban} label={t("outOfService")} tone="neutral" />
        ) : row.original.inHouse ? (
          <StatusBadge icon={Users} label={t("inHouse")} tone="info" />
        ) : (
          <span className="text-muted-foreground">{t("vacant")}</span>
        ),
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
          <span className="text-muted-foreground">{t("notRecorded")}</span>
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
      enableHiding: false,
      enableSorting: false,
      header: () => <span className="sr-only">{t("actions")}</span>,
      cell: ({ row }) =>
        pending ? null : (
          <DataTableRowActions
            actions={MARKS.filter(
              (status) => status !== row.original.status,
            ).map((status) => ({
              label: t(MARK_LABEL[status]),
              icon: STATUS_LOOK[status].icon,
              onSelect: () => onMark([row.original.unitId], status),
            }))}
            label={t("roomActions", { room: row.original.name })}
          />
        ),
    },
  ];
}

export { MARK_LABEL, MARKS };
