import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { IntegrationsView } from "../../../../features/integrations/components/integrations-view";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  entitledProperties,
  INTEGRATIONS_CAPABILITY,
  propertyIntegrations,
  requireViewer,
} from "../../../../server/viewer";

export default async function IntegrationsPage({
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
  const properties = await entitledProperties(INTEGRATIONS_CAPABILITY);
  const property = await frontDeskProperty(
    properties,
    await searchParams,
    localizeHref(locale, "integrations"),
  );

  if (!property) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  const { integrations, failedOperations } = await propertyIntegrations(
    property.propertyId,
  );

  return (
    <IntegrationsView
      failedOperations={failedOperations}
      integrations={integrations}
      locale={locale}
      propertyId={property.propertyId}
    />
  );
}
