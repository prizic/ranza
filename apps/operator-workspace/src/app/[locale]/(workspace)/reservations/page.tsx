import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NewReservationDialog } from "../../../../features/front-office/components/new-reservation-dialog";
import { NoBookableUnit } from "../../../../features/front-office/components/no-bookable-unit";
import { ReservationsTable } from "../../../../features/front-office/components/reservations-table";
import {
  bookableUnits,
  bookingDay,
  entitledProperties,
  FRONT_DESK_CAPABILITY,
  permittedProperties,
  requireViewer,
  reservations,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";

/** Adding, blocking and splitting rooms (accommodation_units' write policies). */
const MANAGES_ROOMS = "accommodation.configure";

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
  searchParams: Promise<{ property?: string; change?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const properties = await entitledProperties(FRONT_DESK_CAPABILITY);
  const search = await searchParams;
  const property = await frontDeskProperty(properties, search);

  if (!property) {
    return (
      <EmptyState
        description={t("noFrontDeskDescription")}
        title={t("noFrontDeskTitle")}
      />
    );
  }

  const units = await bookableUnits(property.propertyId);
  // The business date, not the calendar date in the Property's timezone: the
  // two differ between midnight and the cutoff (RG-S1-10, ADR 0021).
  const today = units.length > 0 ? await bookingDay(property.propertyId) : null;
  const roomsHref =
    units.length === 0 &&
    (await permittedProperties(MANAGES_ROOMS)).some(
      (permitted) => permitted.propertyId === property.propertyId,
    )
      ? `${localizeHref(locale, "rooms")}?property=${property.propertyId}`
      : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("reservationsAt")} {property.propertyName}
        </p>
        {/* Offered whenever the Property has a Unit in service. Whether this
            viewer may book one is the policies' answer, and hiding the button
            on their behalf would be a second, weaker copy of it. With none to
            sell it is shown disabled and says why (RG-S3-04). The two reads
            share their gates, so a Unit with no business date is a
            capability switched off between them, and the next render says
            so. */}
        {units.length === 0 ? (
          <NoBookableUnit roomsHref={roomsHref} />
        ) : today ? (
          <NewReservationDialog
            locale={locale}
            propertyId={property.propertyId}
            today={today}
            units={units}
          />
        ) : null}
      </div>
      <ReservationsTable
        changing={search.change ?? null}
        locale={locale}
        propertyId={property.propertyId}
        reservations={await reservations(property.propertyId)}
      />
    </>
  );
}
