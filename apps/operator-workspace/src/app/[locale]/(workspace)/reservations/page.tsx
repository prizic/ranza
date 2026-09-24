import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { NewReservationDialog } from "../../../../features/front-office/components/new-reservation-dialog";
import { ReservationsTable } from "../../../../features/front-office/components/reservations-table";
import {
  bookableUnits,
  entitledProperties,
  FRONT_DESK_CAPABILITY,
  reservations,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";

/**
 * Reservations: what is booked at this Property from today onwards, and the one
 * thing a front desk does that nothing else in the product could do — take a
 * booking.
 *
 * Its own destination rather than a button on arrivals. A Reservation made for
 * a fortnight's time never appears on an arrivals list, so a form that lived
 * there would have no observable effect, which is indistinguishable from not
 * working. This list is that effect.
 *
 * The two reads are sequential rather than parallel on purpose: both resolve
 * the same session through `currentViewer`, which is `cache`d per request, and
 * issuing them together would only race to be the one that validates it.
 */
export default async function ReservationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const t = await getTranslations();
  const properties = await entitledProperties(FRONT_DESK_CAPABILITY);
  const property = frontDeskProperty(properties, await searchParams);

  if (!property) {
    return (
      <EmptyState
        description={t("noFrontDeskDescription")}
        title={t("noFrontDeskTitle")}
      />
    );
  }

  const units = await bookableUnits(property.propertyId);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("reservationsAt")} {property.propertyName}
        </p>
        {/* Offered whenever the Property has a Unit in service. Whether this
            viewer may book one is the policies' answer, and hiding the button
            on their behalf would be a second, weaker copy of it. */}
        {units.length > 0 ? (
          <NewReservationDialog
            locale={locale}
            propertyId={property.propertyId}
            units={units}
          />
        ) : null}
      </div>
      <ReservationsTable
        locale={locale}
        reservations={await reservations(property.propertyId)}
      />
    </>
  );
}
