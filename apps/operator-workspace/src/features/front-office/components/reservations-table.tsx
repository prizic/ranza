"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReservationRow } from "@ranza/reservations";
import {
  DataTable,
  EmptyState,
  Tabs,
  TabsList,
  TabsTrigger,
  toAsciiDigits,
} from "@ranza/ui";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import { useTableLabels } from "../../../lib/table-labels";
import { ChangeBookingDialog } from "./change-booking-dialog";
import { useReservationColumns } from "./columns";
import {
  inTab,
  RESERVATION_TABS,
  type ReservationTab,
} from "../reservation-tabs";
import { unitLabel } from "../unit-label";

/** The row an action has just made or changed, so the desk can see it. */
const JUST_CHANGED = "bg-primary/5 ring-1 ring-primary/30";

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
  today,
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
  /**
   * The Property's business date, `YYYY-MM-DD`. Without one the date-based
   * tabs cannot say who is arriving, so only All is offered.
   */
  today: string | null;
}) {
  const t = useTranslations();
  const labels = useTableLabels();
  const columns = useReservationColumns(locale, propertyId);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [tab, setTab] = useState<ReservationTab>("all");
  // The list is the only proof a booking or a check-in worked, and a tab can
  // narrow it to somewhere the result is not. So when a row appears or changes
  // status after an action, the list goes back to All and points at that row.
  // Derived while rendering rather than in an effect, so the row is never
  // painted missing first.
  const [previous, setPrevious] = useState(reservations);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  if (previous !== reservations) {
    setPrevious(reservations);
    const before = new Map(
      previous.map((row) => [row.reservationId, row.status]),
    );
    const changed = reservations.find(
      (row) => before.get(row.reservationId) !== row.status,
    );
    if (changed) {
      setTab("all");
      setHighlighted(changed.reservationId);
    }
  }
  // The counts are over everything on the list, not what a search has left, so
  // a tab's number does not move as somebody types.
  const counts = useMemo(
    () =>
      Object.fromEntries(
        RESERVATION_TABS.map((name) => [
          name,
          today
            ? reservations.filter((row) => inTab(row, name, today)).length
            : reservations.length,
        ]),
      ) as Record<ReservationTab, number>,
    [reservations, today],
  );
  const rows = useMemo(
    () =>
      reservations
        .filter((row) => (today ? inTab(row, tab, today) : true))
        .map((row) => ({
          ...row,
          guestPhoneDigits: toAsciiDigits(row.guestPhone ?? "").replace(
            /\D/g,
            "",
          ),
        })),
    [reservations, tab, today],
  );
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
      {today && reservations.length > 0 ? (
        <Tabs
          className="mb-3"
          onValueChange={(value) => {
            setTab(value as ReservationTab);
            setHighlighted(null);
          }}
          value={tab}
        >
          <TabsList aria-label={t("reservationsViews")}>
            {RESERVATION_TABS.map((name) => (
              <TabsTrigger key={name} value={name}>
                {t(`reservationsTab.${name}`)}{" "}
                <span className="tabular-nums text-muted-foreground">
                  {formatNumber(counts[name], locale)}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}
      <DataTable
        caption={t("reservations")}
        columns={columns}
        data={rows}
        empty={
          tab === "all" ? (
            <EmptyState
              description={t("noReservationsDescription")}
              title={t("noReservationsTitle")}
            />
          ) : (
            <EmptyState
              description={t("reservationsTabEmptyHint")}
              title={t(`reservationsTabEmpty.${tab}`)}
            />
          )
        }
        labels={labels}
        getRowId={(row) => row.reservationId}
        rowClassName={(row) =>
          row.reservationId === highlighted ? JUST_CHANGED : undefined
        }
        searchColumns={[
          "guestName",
          "guestEmail",
          "guestPhone",
          "guestPhoneDigits",
          "unitName",
          "roomName",
          "reference",
        ]}
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
