import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HrView } from "../../../../features/hr/components/hr-view";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  entitledProperties,
  HR_CAPABILITY,
  hrViewData,
  requireViewer,
} from "../../../../server/viewer";

export default async function HrPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string; period?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const properties = await entitledProperties(HR_CAPABILITY);
  const property = await frontDeskProperty(
    properties,
    await searchParams,
    localizeHref(locale, "hr"),
  );

  if (!property) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  const { period } = await searchParams;
  const data = await hrViewData(property.propertyId, period);

  if (!data) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  return (
    <HrView data={data} locale={locale} propertyId={property.propertyId} />
  );
}
