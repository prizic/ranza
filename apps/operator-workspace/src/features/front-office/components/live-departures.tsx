"use client";

import { useQuery } from "@tanstack/react-query";
import type { Departure, DepartureView } from "@ranza/reservations";
import type { SupportedLocale } from "@ranza/i18n";
import { frontOfficeKeys, type Scope } from "../query-keys";
import { DeparturesTable } from "./departures-table";

/**
 * Departures, on a screen that stays open.
 *
 * The same shape as `LiveArrivals` and for the same reason: two desks check
 * Guests out at once, and a list read once at page load keeps offering to
 * check out somebody a colleague already sent home.
 */
async function fetchDepartures(
  propertyId: string,
  view: DepartureView,
): Promise<readonly Departure[]> {
  const response = await fetch(
    `/api/front-office/departures?property=${encodeURIComponent(propertyId)}&view=${view}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw Object.assign(new Error("departures could not be read"), {
      status: response.status,
    });
  }
  const body = (await response.json()) as {
    departures: readonly Departure[];
  };
  return body.departures;
}

export function LiveDepartures({
  locale,
  scope,
  view,
}: {
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
  return (
    <DeparturesTable
      departures={data ?? []}
      locale={locale}
      propertyId={scope.propertyId}
      view={view}
    />
  );
}
