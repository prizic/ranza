"use client";

import { useTranslations } from "next-intl";
import type { Departure } from "@ranza/reservations";
import { DataTable, EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useTableLabels } from "../../../lib/table-labels";
import { useDepartureColumns } from "./columns";

/**
 * Today's departures, overdue ones first.
 *
 * The order is the query's, not a default sort here: `listDepartures` orders by
 * planned end date, so anybody already past theirs leads. Sorting a column
 * afterwards is the reader's choice.
 */
export function DeparturesTable({
  departures,
  locale,
}: {
  departures: readonly Departure[];
  locale: SupportedLocale;
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
          <EmptyState
            description={t("noDeparturesDescription")}
            title={t("noDeparturesTitle")}
          />
        }
        labels={labels}
        searchColumns={["guestName", "unitName"]}
      />
    </div>
  );
}
