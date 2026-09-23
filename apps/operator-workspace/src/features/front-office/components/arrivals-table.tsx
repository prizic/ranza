"use client";

import { useTranslations } from "next-intl";
import type { Arrival } from "@ranza/reservations";
import { DataTable, EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useTableLabels } from "../../../lib/table-labels";
import { useArrivalColumns } from "./columns";

/**
 * Today's arrivals.
 *
 * Presentational: it receives the list from the route, which got it through the
 * server funnel. Nothing here reaches the database, which ADR 0007 enforces for
 * every path under `src/` that is not `src/server/`.
 */
export function ArrivalsTable({
  arrivals,
  locale,
}: {
  arrivals: readonly Arrival[];
  locale: SupportedLocale;
}) {
  const t = useTranslations();
  const labels = useTableLabels();
  const columns = useArrivalColumns(locale);

  return (
    <div className="mt-4">
      <DataTable
        caption={t("arrivals")}
        columns={columns}
        data={arrivals}
        empty={
          <EmptyState
            description={t("noArrivalsDescription")}
            title={t("noArrivalsTitle")}
          />
        }
        labels={labels}
        rowId={(row) => row.reservationId}
        searchColumns={["guestName", "unitName", "roomName", "reference"]}
      />
    </div>
  );
}
