"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { OverdueResident } from "@ranza/payment-plans";
import { DataTable, DataTableColumnHeader, EmptyState } from "@ranza/ui";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import { useSortLabels, useTableLabels } from "../../../lib/table-labels";

/**
 * The Residents Today's overdue figure counts, longest overdue first: the same
 * rows, read through the same module, so the figure and this list cannot
 * disagree. It is what is overdue, not what a Resident owes in all, and the
 * notice above it says so. It is a list of people, not of Folios, because the
 * instalments belong to a booking and the module names no Folio.
 */
export function OverdueResidents({
  allHref,
  currency,
  locale,
  residents,
}: {
  allHref: string;
  currency: string;
  locale: SupportedLocale;
  residents: readonly OverdueResident[];
}) {
  const f = useTranslations("finance");
  const labels = useTableLabels();
  const sort = useSortLabels();
  const day = (iso: string) =>
    formatDate(new Date(`${iso}T00:00:00Z`), locale, {
      month: "short",
      timeZone: "UTC",
    });

  const columns: ColumnDef<OverdueResident, unknown>[] = [
    {
      accessorKey: "residentName",
      meta: { title: f("overdueResident") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={f("overdueResident")}
        />
      ),
      cell: ({ row }) =>
        row.original.residentName ? (
          <span className="font-medium">
            <bdi>{row.original.residentName}</bdi>
          </span>
        ) : (
          <span className="text-muted-foreground">
            {f("overdueNameHidden")}
          </span>
        ),
    },
    {
      accessorKey: "instalments",
      meta: { title: f("overdueInstalments") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={f("overdueInstalments")}
        />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.instalments}</span>
      ),
    },
    {
      accessorKey: "overdueMinor",
      meta: { title: f("overdueAmount") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={f("overdueAmount")}
        />
      ),
      cell: ({ row }) => (
        <span className="font-medium text-danger tabular-nums">
          {formatMoney(row.original.overdueMinor, currency, locale)}
        </span>
      ),
    },
    {
      accessorKey: "oldestDueOn",
      meta: { title: f("overdueSince") },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sort}
          title={f("overdueSince")}
        />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">{day(row.original.oldestDueOn)}</span>
      ),
    },
  ];

  return (
    <div className="mt-4">
      <p
        className="mb-3 text-sm text-muted-foreground"
        data-testid="overdue-notice"
      >
        {f("overdueNotice", { count: residents.length })}{" "}
        <Link
          className="font-semibold text-primary hover:underline"
          href={allHref}
          prefetch={false}
        >
          {f("showAll")}
        </Link>
      </p>
      <DataTable
        caption={f("overdueNotice", { count: residents.length })}
        columns={columns}
        data={[...residents]}
        empty={
          <EmptyState
            description={f("overdueEmptyDescription")}
            title={f("overdueEmptyTitle")}
          />
        }
        getRowId={(row) => row.reservationId}
        labels={{ ...labels, searchBy: () => f("overdueResident") }}
        rowsInDatabase={residents.length}
        searchColumns={["residentName"]}
      />
    </div>
  );
}
