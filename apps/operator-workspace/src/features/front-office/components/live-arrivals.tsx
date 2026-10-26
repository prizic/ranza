"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import { ListFilterNotice } from "../../today/components/list-filter-notice";
import { inArrivalFilter, type ArrivalFilter } from "../../today/views";
import { fetchArrivals } from "../queries";
import { frontOfficeKeys, type Scope } from "../query-keys";
import { ArrivalsTable } from "./arrivals-table";
import type { FrontDeskReach } from "../reach";
import { ListFreshness } from "./list-freshness";

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
export function LiveArrivals({
  allHref,
  filter,
  locale,
  reach,
  scope,
  timeZone,
}: {
  /** This list unnarrowed, for the way back from a figure on Today. */
  allHref: string;
  /** The part of the day a figure on Today counted (TD-S5-01). */
  filter: ArrivalFilter | null;
  locale: SupportedLocale;
  /** Which of the pages a row links to the viewer can open. */
  reach: FrontDeskReach;
  scope: Scope;
  /** The Property's own clock, which the freshness line is told in. */
  timeZone: string;
}) {
  const t = useTranslations();
  const { data, dataUpdatedAt, error } = useQuery({
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
  // "To come" is Today's figure, which counts what is due; a booking whose
  // nights all passed is on the unnarrowed list only, so the two agree.
  const rows = (data ?? []).filter(
    (arrival) =>
      inArrivalFilter(filter, arrival) &&
      (filter === null || !arrival.nightsPassed),
  );
  // Nobody is offered a button they may not press: a viewer with the front desk
  // but not check-in sees the whole list, and is told why it has no actions.
  const viewOnly =
    rows.length > 0 && rows.every((arrival) => !arrival.mayCheckIn);
  return (
    <>
      <ListFreshness
        error={error}
        locale={locale}
        timeZone={timeZone}
        updatedAt={dataUpdatedAt}
      />
      {viewOnly ? (
        <p className="mt-3 text-step--1 text-muted-foreground">
          {t("viewOnlyArrivals")}
        </p>
      ) : null}
      {filter === null ? null : (
        <div className="mt-4">
          <ListFilterNotice
            allHref={allHref}
            count={rows.length}
            filter="filterArrivalsToCome"
          />
        </div>
      )}
      <ArrivalsTable
        arrivals={rows}
        locale={locale}
        propertyId={scope.propertyId}
        reach={reach}
      />
    </>
  );
}
