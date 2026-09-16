"use client";

import { useMemo } from "react";
import type { Departure } from "@ranza/reservations";
import { DataTable, EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { tableLabels } from "../../../lib/table-labels";
import type { Messages } from "../../../messages";
import { departureColumns } from "./columns";

/**
 * Today's departures, overdue ones first.
 *
 * The order is the query's, not a default sort here: `listDepartures` orders by
 * planned end date, so anybody already past theirs leads. Sorting a column
 * afterwards is the reader's choice.
 */
export function DeparturesTable({
  copy,
  departures,
  locale,
}: {
  copy: Messages;
  departures: readonly Departure[];
  locale: SupportedLocale;
}) {
  const labels = useMemo(() => tableLabels(copy), [copy]);
  const columns = useMemo(() => departureColumns(copy, locale), [copy, locale]);

  return (
    <div className="mt-4">
      <DataTable
        caption={copy.departures}
        columns={columns}
        data={departures}
        empty={
          <EmptyState
            description={copy.noDeparturesDescription}
            title={copy.noDeparturesTitle}
          />
        }
        labels={labels}
        searchColumns={["guestName", "unitName"]}
      />
    </div>
  );
}
