"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { CircleCheck, Clock, Lock } from "lucide-react";
import type { FolioSummary } from "@ranza/folios";
import { DataTableColumnHeader, StatusBadge } from "@ranza/ui";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import { useSortLabels } from "../../../lib/table-labels";
import { owedMinor } from "../../today/views";
import { folioOverdueDays } from "../derive";

/**
 * Two columns, not four: a Folio is a person and a sum, and a phone holds two.
 * What a column used to carry alone — the stay, the status, the reference, the
 * last posting — sits under the name or the figure it explains, so the Balance
 * is never the thing that scrolls out of reach (FIN-11).
 *
 * `meta.title` is not decoration: the column menu and the search placeholder
 * both read it, so a column without one is a column the reader cannot name.
 *
 * `folioHref` is a string prefix rather than a function that builds one.
 *
 * A server component cannot hand a function to a client component — React
 * refuses it, at runtime rather than at build time, because this route is
 * dynamic and nothing renders it until somebody asks for it. The route knows
 * the locale and the Property; appending the id is the client's share.
 */
export function useFolioColumns(
  locale: SupportedLocale,
  folioHref: string,
): ColumnDef<FolioSummary, unknown>[] {
  const t = useTranslations();
  const f = useTranslations("finance");
  const sort = useSortLabels();
  const day = (iso: string) =>
    formatDate(new Date(`${iso}T00:00:00Z`), locale, {
      month: "short",
      timeZone: "UTC",
    });

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
        const folio = row.original;
        const overdue = folioOverdueDays(folio);
        return (
          <div className="grid justify-items-start gap-1">
            {/* Not prefetched: one row is one request, and all it would fetch
                is the loading boundary — the row's own data is read on the
                click. */}
            <Link
              className="block hover:underline"
              href={`${folioHref}&folio=${folio.folioId}`}
              prefetch={false}
            >
              {/* A walk-in has no name recorded anywhere yet: Guest profiles
                  are blueprint 5.3 and are not built. The Unit identifies
                  them in the meantime, which is what the front desk would use
                  anyway. */}
              <span className="font-medium">
                <bdi>{folio.guestName || folio.unitName}</bdi>
              </span>
              <span className="block text-step--1 text-muted-foreground">
                <bdi>{folio.unitName}</bdi>
                {folio.reference ? (
                  <>
                    {" · "}
                    <bdi>{folio.reference}</bdi>
                  </>
                ) : null}
              </span>
            </Link>
            <span className="text-step--1 text-muted-foreground tabular-nums">
              {folio.endsOn
                ? f("stayDates", {
                    from: day(folio.startsOn),
                    to: day(folio.endsOn),
                  })
                : f("stayFrom", { from: day(folio.startsOn) })}
            </span>
            <span className="flex flex-wrap gap-1">
              <StatusBadge
                icon={folio.status === "open" ? CircleCheck : Lock}
                label={t(`folioStatus.${folio.status}`)}
                tone={folio.status === "open" ? "success" : "neutral"}
              />
              {overdue > 0 ? (
                <StatusBadge
                  icon={Clock}
                  label={t("overdueDays", { count: overdue })}
                  tone="danger"
                />
              ) : null}
            </span>
          </div>
        );
      },
    },
    {
      id: "balanceMinor",
      // Sorted by what the Guest owes, which is the balance plus the nights
      // check-out will charge: the one definition the departures list uses.
      accessorFn: (folio) => owedMinor(folio),
      meta: { title: t("balance") },
      header: ({ column }) => (
        <DataTableColumnHeader
          className="justify-end"
          column={column}
          labels={sort}
          title={t("balance")}
        />
      ),
      // Aligned to the end rather than the right, so the column mirrors in
      // Arabic instead of stranding the figures on the wrong edge. The block
      // sits at the end of a cell the table makes far wider than it, and the
      // header is aligned to it: capped at 9rem only where a phone needs the
      // line to wrap, not where there is room for "Last posted Oct 19, 2026".
      cell: ({ row }) => {
        const folio = row.original;
        return (
          <div className="ms-auto grid max-w-36 justify-items-end gap-0.5 text-end whitespace-normal md:max-w-none">
            <span className="font-medium tabular-nums">
              {formatMoney(folio.balanceMinor, folio.currency, locale)}
            </span>
            {folio.pendingNights > 0 ? (
              <span className="text-step--1 text-muted-foreground tabular-nums">
                {f("plusPending", {
                  amount: formatMoney(
                    folio.pendingMinor,
                    folio.currency,
                    locale,
                  ),
                  count: folio.pendingNights,
                })}
              </span>
            ) : null}
            <span className="text-step--1 text-muted-foreground">
              {folio.lastPostedAt
                ? f("lastPosted", {
                    date: formatDate(folio.lastPostedAt, locale, {
                      month: "short",
                    }),
                  })
                : f("nothingPosted")}
            </span>
          </div>
        );
      },
    },
  ];
}
