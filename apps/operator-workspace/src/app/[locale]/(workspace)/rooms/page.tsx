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

  return (
    <RoomsView
      data={data}
      housekeepingHref={
        hasHousekeeping
          ? `${localizeHref(locale, "housekeeping")}?property=${property.propertyId}`
          : null
      }
      initialView={search.view === "list" ? "list" : "map"}
      locale={locale}
      maintenance={maintenance}
      mayConfigure={mayConfigure}
      propertyId={property.propertyId}
      readiness={readiness}
      targetUnitId={search.unit ?? null}
    />
  );
}
