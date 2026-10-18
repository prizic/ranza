"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Departure, DepartureView } from "@ranza/reservations";
import { DataTable, EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useTableLabels } from "../../../lib/table-labels";
import { useDepartureColumns } from "./columns";

/**
 * The Stays a front desk may check out: due and overdue ones first, or
 * everybody in house.
 *
 * The order is the query's, not a default sort here: `listDepartures` orders by
 * planned departure, so anybody already past theirs leads.
 *
 * A list narrowed by a figure on Today that has no rows says so for the
 * narrowing — "nobody here owes anything" — and how many others are due, and
 * never that nobody is leaving: the day is not empty, only the filter is.
 */
export function DeparturesTable({
  departures,
  filtered,
  locale,
  propertyId,
  view,
}: {
  departures: readonly Departure[];
  /** Set while a narrowing is applied: the way back to everyone, and how many it hides. */
  filtered: { allHref: string; others: number } | null;
  locale: SupportedLocale;
  view: DepartureView;
  /** The Property the rows belong to, which links out of them name. */
  propertyId: string;
}) {
  const t = useTranslations();
  const labels = useTableLabels();
  const columns = useDepartureColumns(locale, propertyId);

  return (
    <div className="mt-4">
      <DataTable
        caption={t("departures")}
        columns={columns}
        data={departures}
        empty={
          filtered ? (
            <EmptyState
              action={
                <Link
                  className="text-sm font-semibold text-primary hover:underline"
                  href={filtered.allHref}
                  prefetch={false}
                >
                  {t("departuresShowAll")}
                </Link>
              }
              description={t("departuresFilteredEmptyHint", {
                others: filtered.others,
              })}
              title={t("departuresFilteredEmptyTitle")}
            />
          ) : view === "due" ? (
            <EmptyState
              description={t("noDeparturesDescription")}
              title={t("noDeparturesTitle")}
            />
          ) : (
            <EmptyState
              description={t("nobodyInHouseDescription")}
              title={t("nobodyInHouseTitle")}
            />
          )
        }
        labels={{
          ...labels,
          searchBy: () => t("searchGuestRoomReference"),
        }}
        getRowId={(row) => row.stayId}
        searchColumns={["guestName", "unitName", "roomName", "reference"]}
      />
    </div>
  );
}
