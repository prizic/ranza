"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CircleCheck, Lock } from "lucide-react";
import type { FolioSummary } from "@ranza/folios";
import { DataTableColumnHeader, StatusBadge } from "@ranza/ui";
import { formatMoney, type SupportedLocale } from "@ranza/i18n";
import type { Messages } from "../../../messages";
import { sortLabels } from "../../../lib/table-labels";

/**
 * `meta.title` is not decoration: the column menu and the search placeholder
 * both read it, so a column without one is a column the reader cannot name.
 */
/**
 * `folioHref` is a string prefix rather than a function that builds one.
 *
 * A server component cannot hand a function to a client component — React
 * refuses it, at runtime rather than at build time, because this route is
 * dynamic and nothing renders it until somebody asks for it. The route knows
 * the locale and the Property; appending the id is the client's share.
 */
export function folioColumns(
  copy: Messages,
  locale: SupportedLocale,
  folioHref: string,
): ColumnDef<FolioSummary, unknown>[] {
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
        <a
          className="block hover:underline"
          href={`${folioHref}&folio=${row.original.folioId}`}
        >
          {/* A walk-in has no name recorded anywhere yet: Guest profiles are
              blueprint 5.3 and are not built. The Unit identifies them in the
              meantime, which is what the front desk would use anyway. */}
          <span className="font-medium">
            {row.original.guestName || row.original.unitName}
          </span>
          <span className="block text-step--1 text-muted-foreground">
            {row.original.unitName}
          </span>
        </a>
      ),
    },
    {
      accessorKey: "lineCount",
      meta: { title: copy.lines },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sortLabels(copy)}
          title={copy.lines}
        />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {row.original.lineCount}
        </span>
      ),
    },
    {
      accessorKey: "status",
      meta: { title: copy.status },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sortLabels(copy)}
          title={copy.status}
        />
      ),
      cell: ({ row }) => (
        <StatusBadge
          icon={row.original.status === "open" ? CircleCheck : Lock}
          label={copy.folioStatus[row.original.status]}
          tone={row.original.status === "open" ? "success" : "neutral"}
        />
      ),
    },
    {
      accessorKey: "balanceMinor",
      meta: { title: copy.balance },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          labels={sortLabels(copy)}
          title={copy.balance}
        />
      ),
      // Aligned to the end rather than the right, so the column mirrors in
      // Arabic instead of stranding the figures on the wrong edge.
      cell: ({ row }) => (
        <p className="text-end font-medium tabular-nums">
          {formatMoney(
            row.original.balanceMinor,
            row.original.currency,
            locale,
          )}
        </p>
      ),
    },
  ];
}
