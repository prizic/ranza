import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { gateOf } from "../../../../lib/screens";
import { ScreenDenied } from "../screen-denied";
import { BrandingView } from "../../../../features/branding/components/branding-view";
import { frontDeskProperty } from "../../../../server/front-desk";
import { LOGO_LIMITS } from "../../../../server/logo-limits";
import {
  organizationBrand,
  permittedProperties,
  requireViewer,
  whyDenied,
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
  const properties = await permittedProperties(
    "branding.manage",
    "platform_core",
    "configuration",
  );
  const property = await frontDeskProperty(
    properties,
    await searchParams,
    localizeHref(locale, "branding"),
  );
  const settings = property
    ? await organizationBrand(property.organizationId)
    : null;

  // The Properties above are those where the permission and the Configuration
  // capability both hold, so a Subscription that has lapsed, an Entitlement
  // that is not there and a Property with Configuration off all leave nothing
  // to open, and `ScreenDenied` says which. `unavailable` is the same answer for
  // the one that changes between the list and the read.
  if (!property || !settings || settings.reason === "unavailable") {
    return (
      <ScreenDenied
        denial={await whyDenied(
          gateOf("branding"),
          (await searchParams).property,
        )}
        locale={locale}
      />
    );
  }

  // Holding the permission at a Property is not holding it across the
  // Organization, which a brand takes: say who can, rather than show a form
  // whose every save would be refused. Only reach is said here: a gate that
  // failed is not something reach can put right.
  if (settings.reason === "reach") {
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
      limits={LOGO_LIMITS}
      key={property.organizationId}
      locale={locale}
      organizationId={property.organizationId}
      organizationName={property.organizationName}
      propertyId={property.propertyId}
    />
  );
}
