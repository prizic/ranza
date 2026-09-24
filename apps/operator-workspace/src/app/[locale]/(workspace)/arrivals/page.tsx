import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { LiveArrivals } from "../../../../features/front-office/components/live-arrivals";
import { frontOfficeKeys } from "../../../../features/front-office/query-keys";
import { Hydrated, requestQueryClient } from "../../../providers/hydrate";
import {
  arrivals,
  currentViewer,
  entitledProperties,
  FRONT_DESK_CAPABILITY,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";

/**
 * Arrivals: who is expected today at one Property, and the one action worth
 * taking on them.
 *
 * Its own route rather than a tab beside departures. They are two jobs done at
 * different times of day, and a tab is a worse link — it cannot be bookmarked,
 * sent to a colleague, or opened in a second window beside the other one.
 *
 * The list is not filtered again here. The policies and the capability gate
 * decided it, and a second application-side check would be the weaker of the
 * two while inviting somebody to trust it instead of the database.
 *
 * The one screen in the product that polls. It is read on a tablet at the desk
 * for a whole shift while other people change what it shows, which is the case
 * ADR 0019 allows a client cache for — and the reason the rows are prefetched
 * here rather than fetched after paint: a front desk should not watch a
 * spinner for data the server already had.
 */
export default async function ArrivalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const t = await getTranslations();
  const viewer = await currentViewer();
  const properties = await entitledProperties(FRONT_DESK_CAPABILITY);
  const property = frontDeskProperty(properties, await searchParams);

  if (!property || !viewer) {
    return (
      <EmptyState
        description={t("noFrontDeskDescription")}
        title={t("noFrontDeskTitle")}
      />
    );
  }

  // Every cache key in the feature starts with these three. They come from the
  // server, where they were decided, rather than from anything the browser
  // could name.
  const scope = {
    organizationId: property.organizationId,
    propertyId: property.propertyId,
    userId: viewer.userId,
  };

  // Created here, inside the request. A client held at module scope on the
  // server is shared by every concurrent request, which is one tenant's rows
  // dehydrated into another tenant's HTML.
  const client = requestQueryClient();
  await client.prefetchQuery({
    queryKey: frontOfficeKeys.arrivals(scope),
    queryFn: () => arrivals(property.propertyId),
  });

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {t("arrivalsAt")} {property.propertyName}
      </p>
      <Hydrated client={client}>
        <LiveArrivals locale={locale} scope={scope} />
      </Hydrated>
    </>
  );
}
