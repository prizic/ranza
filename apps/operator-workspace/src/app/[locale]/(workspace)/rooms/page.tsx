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
import { knownBlock } from "../../../../features/rooms/narrowing";
import {
  blockParam,
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
    block?: string;
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

  const [
    data,
    maintenance,
    mayConfigure,
    housekeeping,
    bookings,
    calendar,
    maintenanceScreen,
    readiness,
  ] = await Promise.all([
    rooms(property.propertyId),
    roomsMaintenance(property.propertyId),
    mayConfigureRooms(property.propertyId),
    screenProperties(gateOf("housekeeping")),
    screenProperties(gateOf("reservations")),
    screenProperties(gateOf("room-calendar")),
    screenProperties(gateOf("maintenance")),
    roomsReadiness(property.propertyId),
  ]);
  // A link to another screen is offered only when the viewer may open it at
  // this Property, so a button never ends in a refusal.
  const linkTo = (
    segment: string,
    screens: readonly { propertyId: string }[],
  ) =>
    screens.some((candidate) => candidate.propertyId === property.propertyId)
      ? `${localizeHref(locale, segment)}?property=${property.propertyId}`
      : null;
  // A building no room is in is no narrowing, like an unknown ?show= (TD-S5-04).
  const initialFilter = {
    show: parseUnitStateFilter(search.show),
    admits: parseAdmitsFilter(search.admits),
    block: knownBlock(search.block, data.units),
  };

  return (
    <RoomsView
      data={data}
      // A new narrowing from a link is a new starting point, not a change to
      // the filters somebody set by hand.
      key={`${initialFilter.show}:${initialFilter.admits}:${initialFilter.block === null ? "" : blockParam(initialFilter.block.block)}`}
      calendarHref={linkTo("room-calendar", calendar)}
      housekeepingHref={linkTo("housekeeping", housekeeping)}
      initialFilter={initialFilter}
      initialView={search.view === "list" ? "list" : "map"}
      locale={locale}
      maintenance={maintenance}
      maintenanceHref={linkTo("maintenance", maintenanceScreen)}
      reservationsHref={linkTo("reservations", bookings)}
      mayConfigure={mayConfigure}
      offerAdmits={property.operatingModel === "dormitory"}
      propertyId={property.propertyId}
      readiness={readiness}
      targetUnitId={search.unit ?? null}
    />
  );
}
