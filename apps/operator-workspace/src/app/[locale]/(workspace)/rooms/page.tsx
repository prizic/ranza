import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { RoomsView } from "../../../../features/rooms/components/rooms-view";
import {
  currentViewer,
  entitledProperties,
  FRONT_DESK_CAPABILITY,
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

  const [data, maintenance] = await Promise.all([
    rooms(property.propertyId),
    roomsMaintenance(property.propertyId),
  ]);

  return (
    <RoomsView
      locale={locale}
      propertyId={property.propertyId}
      propertyName={property.propertyName}
      data={data}
      maintenance={maintenance}
    />
  );
}
