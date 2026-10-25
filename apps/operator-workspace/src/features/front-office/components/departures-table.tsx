"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Departure, DepartureView } from "@ranza/reservations";
import { DataTable, EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useTableLabels } from "../../../lib/table-labels";
import { useDepartureColumns } from "./columns";
import { REACHES_EVERYTHING, type FrontDeskReach } from "../reach";
import { useOverflowing } from "../use-overflowing";


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
  reach = REACHES_EVERYTHING,
  view,
}: {
  departures: readonly Departure[];
  /** Set while a narrowing is applied: the way back to everyone, and how many it hides. */
  filtered: { allHref: string; others: number } | null;
  locale: SupportedLocale;
  view: DepartureView;
  /** The Property the rows belong to, which links out of them name. */
  propertyId: string;
  /** Which of the pages a row links to the viewer can open. */
  reach?: FrontDeskReach;
}) {
  const t = useTranslations();
  const labels = useTableLabels();
  const [listRef, narrow] = useOverflowing<HTMLDivElement>(departures);
  const columns = useDepartureColumns(locale, propertyId, reach, narrow);

  return (
    <div className="mt-4" ref={listRef}>
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
          // A search that finds nobody among those due says where else to
          // look, because the Guest who is in house but not leaving today is
          // exactly who it will not find (ARRIVALS-13).
          ...(view === "due"
            ? {
                noMatches: t("departuresNoMatchesDue", {
                  inHouse: t("departuresInHouse"),
                }),
              }
            : {}),
        }}
        getRowId={(row) => row.stayId}
        pageSize={50}
        searchColumns={["guestName", "unitName", "roomName", "reference"]}
      />
    </div>
  );
}
