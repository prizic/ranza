import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { Button, EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { DepartureView } from "@ranza/reservations";
import { LiveDepartures } from "../../../../features/front-office/components/live-departures";
import { frontOfficeKeys } from "../../../../features/front-office/query-keys";
import { Hydrated, requestQueryClient } from "../../../providers/hydrate";
import {
  departures,
  entitledProperties,
  FRONT_DESK_CAPABILITY,
  requireViewer,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";

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
 * Two views as links rather than tabs: a link can be bookmarked and opened
 * beside the other, and the view is part of the address the list polls.
 */
export default async function DeparturesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string; view?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations();
  const viewer = await requireViewer(locale);
  const search = await searchParams;
  const properties = await entitledProperties(FRONT_DESK_CAPABILITY);
  const property = frontDeskProperty(properties, search);

  if (!property) {
    return (
      <EmptyState
        description={t("noFrontDeskDescription")}
        title={t("noFrontDeskTitle")}
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

  const base = `${localizeHref(locale, "departures")}?property=${property.propertyId}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {view === "due" ? t("departuresAt") : t("inHouseAt")}{" "}
          {property.propertyName}
        </p>
        <nav aria-label={t("departuresViews")} className="flex gap-1">
          <Button
            asChild
            size="sm"
            variant={view === "due" ? "secondary" : "ghost"}
          >
            <Link
              aria-current={view === "due" ? "page" : undefined}
              href={base}
            >
              {t("departuresDue")}
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant={view === "in_house" ? "secondary" : "ghost"}
          >
            <Link
              aria-current={view === "in_house" ? "page" : undefined}
              href={`${base}&view=in_house`}
            >
              {t("departuresInHouse")}
            </Link>
          </Button>
        </nav>
      </div>
      <Hydrated client={client}>
        <LiveDepartures locale={locale} scope={scope} view={view} />
      </Hydrated>
    </>
  );
}
