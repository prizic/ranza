import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NewReservationDialog } from "../../../../features/front-office/components/new-reservation-dialog";
import { NoBookableUnit } from "../../../../features/front-office/components/no-bookable-unit";
import { ReservationsTable } from "../../../../features/front-office/components/reservations-table";
import {
  bookableUnits,
  bookingDay,
  permittedProperties,
  requireViewer,
  reservations,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";
import { ScreenDenied } from "../screen-denied";
import { gateOf } from "../../../../lib/screens";
import { frontDeskProperty } from "../../../../server/front-desk";

/** Adding, blocking and splitting rooms (accommodation_units' write policies). */
const MANAGES_ROOMS = "accommodation.configure";

/** Taking a booking (reservations_insert_front_desk). */
const TAKES_BOOKINGS = "front_desk.book";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return { title: `${t("navigation.reservations")} · ${t("productName")}` };
}

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
  searchParams: Promise<{
    property?: string;
    change?: string;
    new?: string;
    open?: string;
  }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const properties = await screenProperties(gateOf("reservations"));
  const search = await searchParams;
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale, "reservations"),
  );

  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(
          gateOf("reservations"),
          (await searchParams).property,
        )}
        locale={locale}
      />
    );
  }

  const units = await bookableUnits(property.propertyId);
  // The business date, not the calendar date in the Property's timezone: the
  // two differ between midnight and the cutoff (RG-S1-10, ADR 0021). Read
  // whether or not a Unit can be booked: the list's tabs need it as much as
  // the dialog's calendar does.
  const today = await bookingDay(property.propertyId);
  // Offering the button is the screen's half and refusing the booking stays the
  // policies': a role without the permission is not shown a control it cannot
  // use, as on every other front-desk list (FD-S5-03, RG-S3-05).
  const mayBook = (await permittedProperties(TAKES_BOOKINGS)).some(
    (permitted) => permitted.propertyId === property.propertyId,
  );
  const roomsHref =
    units.length === 0 &&
    (await permittedProperties(MANAGES_ROOMS)).some(
      (permitted) => permitted.propertyId === property.propertyId,
    )
      ? `${localizeHref(locale, "rooms")}?property=${property.propertyId}`
      : null;

  const mayReadHistory = (await screenProperties(gateOf("audit-log"))).some(
    (permitted) => permitted.propertyId === property.propertyId,
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("reservationsAt")} {property.propertyName}
        </p>
        {/* Offered to a viewer holding front_desk.book whenever the Property
            has a Unit in service; the policies still decide each booking. With
            none to sell it is shown disabled and says why (RG-S3-04). The two
            reads share their gates, so a Unit with no business date is a
            capability switched off between them, and the next render says
            so. A viewer who may not book is offered nothing (RG-S3-05). */}
        {!mayBook ? null : units.length === 0 ? (
          <NoBookableUnit roomsHref={roomsHref} />
        ) : today ? (
          <NewReservationDialog
            locale={locale}
            propertyId={property.propertyId}
            startOpen={search.new === "1"}
            today={today}
            units={units}
          />
        ) : null}
      </div>
      <ReservationsTable
        changing={search.change ?? null}
        locale={locale}
        mayReadHistory={mayReadHistory}
        opening={search.open ?? null}
        propertyId={property.propertyId}
        reservations={await reservations(property.propertyId)}
        today={today}
      />
    </>
  );
}
