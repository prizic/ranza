import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { messages } from "../../../../messages";
import { FrontOfficeTables } from "../../../../features/front-office/components/front-office-tables";
import {
  arrivals,
  departures,
  entitledProperties,
  FRONT_DESK_CAPABILITY,
} from "../../../../server/viewer";

/**
 * Front Office: the day's movement at one Property, and the two actions worth
 * taking on it.
 *
 * Arrivals and departures. Blueprint 5.3 also covers room moves, extensions and
 * a Reservation timeline, and none of them are built — a screen that listed them
 * greyed out would be advertising, not an interface.
 *
 * Neither list is filtered again here. The policies and the capability gate
 * decided them, and a second application-side check would be the weaker of the
 * two while inviting somebody to trust it instead of the database.
 */
export default async function FrontOfficePage({
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
  const [fallback] = properties;

  if (!fallback) {
    return (
      <EmptyState
        description={copy.noFrontDeskDescription}
        title={copy.noFrontDeskTitle}
      />
    );
  }

  // A Property the viewer may not reach is simply absent from this list, so an
  // unknown or forged ?property= falls back to the first one they can reach.
  const { property: requested } = await searchParams;
  const property =
    properties.find((candidate) => candidate.propertyId === requested) ??
    fallback;

  // In parallel: they are independent reads and the page waits for the slower.
  const [today, leaving] = await Promise.all([
    arrivals(property.propertyId),
    departures(property.propertyId),
  ]);

  return (
    <>
      <p className="text-muted-foreground">
        {copy.arrivalsAt} {property.propertyName}
      </p>

      <FrontOfficeTables
        arrivals={today}
        copy={copy}
        departures={leaving}
        locale={locale}
      />
    </>
  );
}
