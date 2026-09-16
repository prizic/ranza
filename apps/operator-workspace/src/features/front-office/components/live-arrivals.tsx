"use client";

import { useQuery } from "@tanstack/react-query";
import type { Arrival } from "@ranza/reservations";
import type { SupportedLocale } from "@ranza/i18n";
import { frontOfficeKeys, type Scope } from "../query-keys";
import { ArrivalsTable } from "./arrivals-table";

/**
 * Arrivals, on a screen that stays open.
 *
 * A front desk leaves this up for a shift while other people check Guests in
 * from other terminals. A Server Component alone would show whatever was true
 * when the page loaded, and `router.refresh()` on a timer re-renders the whole
 * route on the server and jumps a long list mid-scroll.
 *
 * So this one screen polls. That is the exception ADR 0019 describes and the
 * shape it has to take: the rows still come from `src/server/` through a route
 * handler, the policies still decide them, and nothing here is authorization.
 */
async function fetchArrivals(propertyId: string): Promise<readonly Arrival[]> {
  const response = await fetch(
    `/api/front-office/arrivals?property=${encodeURIComponent(propertyId)}`,
    // The cache that matters is this one. Letting the browser serve a stale
    // copy would make the poll interval a suggestion.
    { cache: "no-store" },
  );
  if (!response.ok) {
    // Carries the status so the retry policy can tell "try again" from "no".
    throw Object.assign(new Error("arrivals could not be read"), {
      status: response.status,
    });
  }
  const body = (await response.json()) as { arrivals: readonly Arrival[] };
  return body.arrivals;
}

export function LiveArrivals({
  locale,
  scope,
}: {
  locale: SupportedLocale;
  scope: Scope;
}) {
  const { data } = useQuery({
    // From the factory, never written inline. The prefix is the user, the
    // Organization and the Property, which is what stops a switch being
    // answered from the previous Property's rows.
    queryKey: frontOfficeKeys.arrivals(scope),
    queryFn: () => fetchArrivals(scope.propertyId),
    // A minute is a long time at a front desk and thirty seconds is not. The
    // tab being hidden pauses this by default, which is the behaviour wanted:
    // nobody is reading it.
    refetchInterval: 30_000,
  });

  // `data` is present on first paint because the route prefetched it and
  // `Hydrated` handed it over. A 401 or a refusal leaves the last good rows on
  // screen rather than blanking a working list.
  return <ArrivalsTable arrivals={data ?? []} locale={locale} />;
}
