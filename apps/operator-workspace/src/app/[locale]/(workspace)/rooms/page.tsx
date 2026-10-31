import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";
import { RoomsView } from "../../../../features/rooms/components/rooms-view";
import {
  mayConfigureRooms,
  requireViewer,
  rooms,
  roomsMaintenance,
  roomsReadiness,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";
import { ScreenDenied } from "../screen-denied";
import { gateOf } from "../../../../lib/screens";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  parseAdmitsFilter,
  parseUnitStateFilter,
} from "../../../../features/today/views";

/**
 * Rooms & beds (RB-S1-01, blueprint 4.7): every room and bed at this Property,
 * and what each is doing tonight.
 *
 * Gated by the front_desk capability under Front Office.
 */
export default async function RoomsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    property?: string;
    unit?: string;
    view?: string;
    show?: string;
    admits?: string;
  }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  await requireViewer(locale);
  const properties = await screenProperties(gateOf("rooms"));
  const search = await searchParams;
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale, "rooms"),
  );

  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(gateOf("rooms"), (await searchParams).property)}
        locale={locale}
      />
    );
  }

  const [data, maintenance, mayConfigure, housekeeping, readiness] =
    await Promise.all([
      rooms(property.propertyId),
      roomsMaintenance(property.propertyId),
      mayConfigureRooms(property.propertyId),
      screenProperties(gateOf("housekeeping")),
      roomsReadiness(property.propertyId),
    ]);
  const hasHousekeeping = housekeeping.some(
    (candidate) => candidate.propertyId === property.propertyId,
  );
  const initialFilter = {
    show: parseUnitStateFilter(search.show),
    admits: parseAdmitsFilter(search.admits),
  };

  return (
    <RoomsView
      data={data}
      // A new narrowing from a link is a new starting point, not a change to
      // the filters somebody set by hand.
      key={`${initialFilter.show}:${initialFilter.admits}`}
      housekeepingHref={
        hasHousekeeping
          ? `${localizeHref(locale, "housekeeping")}?property=${property.propertyId}`
          : null
      }
      initialFilter={initialFilter}
      initialView={search.view === "list" ? "list" : "map"}
      locale={locale}
      maintenance={maintenance}
      mayConfigure={mayConfigure}
      offerAdmits={property.operatingModel === "dormitory"}
      propertyId={property.propertyId}
      readiness={readiness}
      targetUnitId={search.unit ?? null}
    />
  );
}
