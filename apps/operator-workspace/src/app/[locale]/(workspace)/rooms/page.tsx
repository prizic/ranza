import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RoomsView } from "../../../../features/rooms/components/rooms-view";
import {
  entitledProperties,
  FRONT_DESK_CAPABILITY,
  HOUSEKEEPING_CAPABILITY,
  mayConfigureRooms,
  requireViewer,
  rooms,
  roomsMaintenance,
} from "../../../../server/viewer";
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

  const t = await getTranslations();
  await requireViewer(locale);
  const properties = await entitledProperties(FRONT_DESK_CAPABILITY);
  const search = await searchParams;
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale, "rooms"),
  );

  if (!property) {
    return (
      <EmptyState
        description={t("noFrontDeskDescription")}
        title={t("noFrontDeskTitle")}
      />
    );
  }

  const [data, maintenance, mayConfigure, housekeeping] = await Promise.all([
    rooms(property.propertyId),
    roomsMaintenance(property.propertyId),
    mayConfigureRooms(property.propertyId),
    entitledProperties(HOUSEKEEPING_CAPABILITY),
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
      targetUnitId={search.unit ?? null}
    />
  );
}
