"use client";

import { useQuery } from "@tanstack/react-query";
import type { DepartureView } from "@ranza/reservations";
import type { SupportedLocale } from "@ranza/i18n";
import { ListFilterNotice } from "../../today/components/list-filter-notice";
import { money } from "../../today/format";
import {
  inDepartureFilter,
  totals,
  type DepartureFilter,
} from "../../today/views";
import { frontOfficeKeys, type Scope } from "../query-keys";
import { fetchDepartures } from "../queries";
import { DeparturesTable } from "./departures-table";

/**
 * Departures, on a screen that stays open.
 *
 * The same shape as `LiveArrivals` and for the same reason: two desks check
 * Guests out at once, and a list read once at page load keeps offering to
 * check out somebody a colleague already sent home.
 */
export function LiveDepartures({
  allHref,
  filter,
  locale,
  scope,
  view,
}: {
  /** This list unnarrowed, for the way back from a figure on Today. */
  allHref: string;
  /** The part of the day a figure on Today counted (TD-S5-01). */
  filter: DepartureFilter | null;
  locale: SupportedLocale;
  scope: Scope;
  view: DepartureView;
}) {
  const { data } = useQuery({
    queryKey: frontOfficeKeys.departures(scope, view),
    queryFn: () => fetchDepartures(scope.propertyId, view),
    refetchInterval: 30_000,
  });

  // Present on first paint from the prefetch. A refusal leaves the last good
  // rows on screen rather than blanking a working list.
  const rows = (data ?? []).filter((departure) =>
    inDepartureFilter(filter, departure),
  );
  const first = rows[0];
  return (
    <>
      {filter === null ? null : (
        <div className="mt-4">
          <ListFilterNotice
            allHref={allHref}
            count={rows.length}
            detail={
              first
                ? money(
                    totals(
                      rows.map((row) => ({
                        amountMinor: row.balanceMinor,
                        currency: row.currency,
                      })),
                    ),
                    first.currency,
                    locale,
                  )
                : undefined
            }
            filter={filter === "owing" ? "filterOwing" : "filterOverdueOwing"}
          />
        </div>
      )}
      <DeparturesTable
        departures={rows}
        locale={locale}
        propertyId={scope.propertyId}
        view={view}
      />
    </>
  );
}
