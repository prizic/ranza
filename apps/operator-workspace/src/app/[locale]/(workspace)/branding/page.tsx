import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BrandingView } from "../../../../features/branding/components/branding-view";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  organizationBrand,
  permittedProperties,
  requireViewer,
} from "../../../../server/viewer";

/**
 * Branding (blueprint 8, ADR 0046): the colour and the logo the Guest Portal is
 * drawn in, for the whole Organization.
 *
 * Opened from a Property like every screen, but it is the Organization's: the
 * Property only says which Organization. A Staff Member without
 * `branding.manage` has no rail entry, and one who reaches the URL anyway finds
 * the same page as an Organization with nothing to show (what a viewer may not
 * reach is not distinguishable from what does not exist).
 */
export default async function BrandingPage({
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
  const properties = await permittedProperties("branding.manage");
  const property = await frontDeskProperty(
    properties,
    await searchParams,
    localizeHref(locale, "branding"),
  );
  const settings = property
    ? await organizationBrand(property.organizationId)
    : null;

  if (!property || !settings) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  // Holding the permission at a Property is not holding it across the
  // Organization, which a brand takes: say who can, rather than show a form
  // whose every save would be refused.
  if (!settings.canManage) {
    return (
      <EmptyState
        description={t("branding.needsReach")}
        title={t("branding.needsReachTitle")}
      />
    );
  }

  return (
    <BrandingView
      brand={settings.brand}
      key={property.organizationId}
      locale={locale}
      organizationId={property.organizationId}
      organizationName={property.organizationName}
      propertyId={property.propertyId}
    />
  );
}
