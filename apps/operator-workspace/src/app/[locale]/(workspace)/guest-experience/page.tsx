import { notFound } from "next/navigation";
import {
  isSupportedLocale,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GuestExperienceView } from "../../../../features/guest-experience/components/guest-experience-view";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  entitledProperties,
  GUEST_SERVICES_CAPABILITY,
  propertyServiceRequests,
  requireViewer,
  rooms,
} from "../../../../server/viewer";

/**
 * Guest Experience & Service Request Lifecycle (Blueprint 5.5, 4.3).
 *
 * Gated by the guest services capability. Displays service requests queue,
 * status transitions, and dialog to log requests.
 */
export default async function GuestExperiencePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const properties = await entitledProperties(GUEST_SERVICES_CAPABILITY);
  const property = await frontDeskProperty(
    properties,
    await searchParams,
    localizeHref(locale, "guest-experience"),
  );

  if (!property) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  const [requests, unitMap] = await Promise.all([
    propertyServiceRequests(property.propertyId),
    rooms(property.propertyId),
  ]);

  const units = unitMap.units.map((u) => ({
    unitId: u.unitId,
    name: u.name,
  }));

  return (
    <GuestExperienceView
      locale={locale as SupportedLocale}
      propertyId={property.propertyId}
      propertyName={property.propertyName}
      requests={requests}
      timeZone={property.timezone}
      units={units}
    />
  );
}
