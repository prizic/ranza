"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Arrival } from "@ranza/reservations";
import { DataTable, EmptyState } from "@ranza/ui";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import type { ArrivalRow } from "../../../server/viewer";
import { useTableLabels } from "../../../lib/table-labels";
import { useArrivalColumns } from "./columns";
import { REACHES_EVERYTHING, type FrontDeskReach } from "../reach";
import { useOverflowing } from "../use-overflowing";

/**
 * The order a desk works the list in: Guests already late first, then by the
 * time they said they would come (nobody-said last), then by room — and those
 * already in the room folded to the end, where they are a record and not work.
 * A sort the reader chooses replaces it; this is what the list opens on.
 */
export function inWorkingOrder<T extends Arrival>(arrivals: readonly T[]): T[] {
  const roomOf = (arrival: Arrival) => arrival.roomName ?? arrival.unitName;
  return [...arrivals].sort(
    (a, b) =>
      Number(a.status === "checked_in") - Number(b.status === "checked_in") ||
      b.daysLate - a.daysLate ||
      (a.expectedArrival ?? "99:99").localeCompare(
        b.expectedArrival ?? "99:99",
      ) ||
      roomOf(a).localeCompare(roomOf(b), undefined, { numeric: true }) ||
      a.unitName.localeCompare(b.unitName, undefined, { numeric: true }),
  );
}

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
  propertyId,
  reach = REACHES_EVERYTHING,
}: {
  arrivals: readonly ArrivalRow[];
  locale: SupportedLocale;
  /** The Property the rows belong to, which links out of them name. */
  propertyId: string;
  /** Which of the pages a row links to the viewer can open. */
  reach?: FrontDeskReach;
}) {
  const t = useTranslations();
  const labels = useTableLabels();
  const [listRef, narrow] = useOverflowing<HTMLDivElement>(arrivals);
  const allColumns = useArrivalColumns(locale, propertyId, reach, narrow);
  const ordered = useMemo(() => inWorkingOrder(arrivals), [arrivals]);
  // Nobody has a Folio before check-in, so the column would read "No Folio" on
  // every row and spend its width on a constant: it is left out until a row has
  // one, and the room it frees keeps the whole row in view at a desk's width.
  const anyFolio = arrivals.some((arrival) => arrival.folioId !== null);
  const columns = useMemo(
    () => allColumns.filter((column) => column.id !== "balance" || anyFolio),
    [allColumns, anyFolio],
  );
  return (
    <div className="mt-4" ref={listRef}>
      <DataTable
        caption={t("arrivals")}
        columns={columns}
        data={ordered}
        empty={
          <EmptyState
            description={t("noArrivalsDescription")}
            title={t("noArrivalsTitle")}
          />
        }
        labels={{
          ...labels,
          searchBy: () => t("searchGuestRoomReference"),
        }}
        getRowId={(row) => row.reservationId}
        pageSize={50}
        searchColumns={["guestName", "unitName", "roomName", "reference"]}
      />
      <p className="mt-3 text-step--1 text-muted-foreground">
        <Link
          className="underline underline-offset-4"
          href={`${localizeHref(locale, "reservations")}?property=${propertyId}`}
          prefetch={false}
        >
          {t("arrivalsElsewhere")}
        </Link>
      </p>
    </div>
  );
}
