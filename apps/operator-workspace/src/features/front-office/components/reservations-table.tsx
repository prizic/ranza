"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReservationRow } from "@ranza/reservations";
import { DataTable, EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useTableLabels } from "../../../lib/table-labels";
import { ChangeBookingDialog } from "./change-booking-dialog";
import { useReservationColumns } from "./columns";
import { unitLabel } from "../unit-label";

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
  changing,
  locale,
  propertyId,
  reservations,
}: {
  /**
   * A booking to open in Change booking on arrival, from `?change=` — where a
   * maintenance warning sends the desk to move a booking off a room going out
   * of order (AB-S1-17). Ignored unless it is on this list and changeable.
   */
  changing: string | null;
  locale: SupportedLocale;
  reservations: readonly ReservationRow[];
  /** The Property the rows belong to, which links out of them name. */
  propertyId: string;
}) {
  const t = useTranslations();
  const labels = useTableLabels();
  const columns = useReservationColumns(locale, propertyId);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const linked = reservations.find(
    (row) => row.reservationId === changing && row.mayAmend,
  );

  // Closing it drops the parameter, so a refresh does not open it again.
  // Stable, because the dialog closes itself from an effect that lists it.
  const linkedOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
      const next = new URLSearchParams(search);
      next.delete("change");
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
    [pathname, router, search],
  );

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
        getRowId={(row) => row.reservationId}
        searchColumns={["guestName", "unitName", "roomName", "reference"]}
      />
      {linked ? (
        <ChangeBookingDialog
          booking={{
            reservationId: linked.reservationId,
            reference: linked.reference,
            guestName: linked.guestName,
            unitLabel: unitLabel(linked.roomName, linked.unitName),
            unitId: linked.unitId,
            startsOn: linked.startsOn,
            endsOn: linked.endsOn,
          }}
          key={linked.reservationId}
          locale={locale}
          onOpenChange={linkedOpenChange}
          open
        />
      ) : null}
    </div>
  );
}
