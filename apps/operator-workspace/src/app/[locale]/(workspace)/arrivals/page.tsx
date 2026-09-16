import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { messages } from "../../../../messages";
import { ArrivalsTable } from "../../../../features/front-office/components/arrivals-table";
import {
  arrivals,
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

  const copy = messages[locale];
  const properties = await entitledProperties(FRONT_DESK_CAPABILITY);
  const property = frontDeskProperty(properties, await searchParams);

  if (!property) {
    return (
      <EmptyState
        description={copy.noFrontDeskDescription}
        title={copy.noFrontDeskTitle}
      />
    );
  }

  return (
    <>
      <p className="text-muted-foreground">
        {copy.arrivalsAt} {property.propertyName}
      </p>
      <ArrivalsTable
        arrivals={await arrivals(property.propertyId)}
        copy={copy}
        locale={locale}
      />
    </>
  );
}
