"use client";

import { useTranslations } from "next-intl";
import type { ReservationRow } from "@ranza/reservations";
import { DataTable, EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useTableLabels } from "../../../lib/table-labels";
import { useReservationColumns } from "./columns";

/**
 * The Property's current and upcoming Reservations.
 *
 * Presentational: it receives the list from the route, which got it through the
 * server funnel. Nothing here reaches the database, which ADR 0007 enforces for
 * every path under `src/` that is not `src/server/`.
 *
 * It does not poll. Arrivals does, because a front desk watches it for a whole
 * shift while other people change what it shows (ADR 0019); a booking list is
 * read when somebody comes to make a booking, and the write that changes it is
 * the reader's own.
 */
export function ReservationsTable({
  locale,
  reservations,
}: {
  locale: SupportedLocale;
  reservations: readonly ReservationRow[];
}) {
  const t = useTranslations();
  const labels = useTableLabels();
  const columns = useReservationColumns(locale);

  return (
    <div className="mt-4">
      <DataTable
        caption={t("reservations")}
        columns={columns}
        data={reservations}
        empty={
          <EmptyState
            description={t("noReservationsDescription")}
            title={t("noReservationsTitle")}
          />
        }
        labels={labels}
        rowId={(row) => row.reservationId}
        searchColumns={["guestName", "unitName", "roomName", "reference"]}
      />
    </div>
  );
}
