"use client";

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
 */
export function DeparturesTable({
  departures,
  locale,
  view,
}: {
  departures: readonly Departure[];
  locale: SupportedLocale;
  view: DepartureView;
}) {
  const t = useTranslations();
  const labels = useTableLabels();
  const columns = useDepartureColumns(locale);

  return (
    <div className="mt-4">
      <DataTable
        caption={t("departures")}
        columns={columns}
        data={departures}
        empty={
          view === "due" ? (
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
        labels={labels}
        rowId={(row) => row.stayId}
        searchColumns={["guestName", "unitName", "roomName", "reference"]}
      />
    </div>
  );
}
