import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { DepartureView } from "@ranza/reservations";
import { LiveDepartures } from "../../../../features/front-office/components/live-departures";
import { LiveLeftToday } from "../../../../features/front-office/components/live-left-today";
import { parseDepartureFilter } from "../../../../features/today/views";
import { frontOfficeKeys } from "../../../../features/front-office/query-keys";
import { Hydrated, requestQueryClient } from "../../../providers/hydrate";
import {
  departedToday,
  departures,
  requireViewer,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";
import { ScreenDenied } from "../screen-denied";
import { gateOf } from "../../../../lib/screens";
import {
  frontDeskProperty,
  frontDeskReach,
} from "../../../../server/front-desk";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return { title: `${t("navigation.departures")} · ${t("productName")}` };
}

/**
 * Departures: who is due to leave, anyone who should already have gone, and —
 * one link away — everybody in house.
 *
 * The overdue rows are why this is a screen rather than a column on the
 * arrivals one. A list showing only today hides the Guest who should have left
 * on Tuesday, which is the row a front desk most needs. The in-house view is
 * where a Guest leaving early and a Resident with no end date are checked out:
 * neither is ever due, and both leave.
 *
 * The views are links in one filter row rather than tabs: a link can be
 * bookmarked and opened beside the other, and the view is part of the address
 * the list polls.
 */
export default async function DeparturesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    property?: string;
    show?: string;
    view?: string;
  }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations();
  const viewer = await requireViewer(locale);
  const search = await searchParams;
  const properties = await screenProperties(gateOf("departures"));
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale, "departures"),
  );

  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(
          gateOf("departures"),
          (await searchParams).property,
        )}
        locale={locale}
      />
    );
  }

  const view: DepartureView = search.view === "in_house" ? "in_house" : "due";
  const scope = {
    organizationId: property.organizationId,
    propertyId: property.propertyId,
    userId: viewer.userId,
  };

  // Inside the request, never at module scope: a shared client would carry one
  // tenant's rows into another's HTML.
  const client = requestQueryClient();
  await client.prefetchQuery({
    queryKey: frontOfficeKeys.departures(scope, view),
    queryFn: () => departures(property.propertyId, view),
  });
  // Who has already gone sits under who is still to go, on the due view only:
  // an in-house list has no "today" to have left on.
  if (view === "due") {
    await client.prefetchQuery({
      queryKey: frontOfficeKeys.departedToday(scope),
      queryFn: () => departedToday(property.propertyId),
    });
  }

  const reach = await frontDeskReach(property.propertyId);

  const base = `${localizeHref(locale, "departures")}?property=${property.propertyId}`;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {view === "due" ? t("departuresAt") : t("inHouseAt")}{" "}
        {property.propertyName}
      </p>
      <Hydrated client={client}>
        <LiveDepartures
          allHref={base}
          filter={view === "due" ? parseDepartureFilter(search.show) : null}
          locale={locale}
          reach={reach}
          scope={scope}
          timeZone={property.timezone}
          view={view}
        />
        {view === "due" ? (
          <LiveLeftToday
            locale={locale}
            scope={scope}
            timeZone={property.timezone}
          />
        ) : null}
      </Hydrated>
    </>
  );
}
