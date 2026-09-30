import { notFound } from "next/navigation";
import {
  isSupportedLocale,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AnalyticsDashboard } from "../../../../features/analytics";
import { screenFor } from "../../../../lib/screens";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  entitledProperties,
  propertyAnalytics,
  requireViewer,
} from "../../../../server/viewer";

const SEGMENT = "analytics";

/**
 * Analytics — Property operational and financial dashboard.
 *
 * Operational metrics (sellable inventory, occupied room nights, occupancy rate %)
 * are available to any staff member with Property access.
 * Commercial and financial KPIs (room revenue, incidental revenue, total revenue, ADR,
 * RevPAR, and payments breakdown) are strictly gated by 'finance.manage_folio'.
 * Date ranges (today, 7d, 30d, mtd) are evaluated using the Property's active business date.
 */
export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string; range?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const search = await searchParams;
  const screen = screenFor(SEGMENT);
  if (!screen) notFound();

  const properties = await entitledProperties({
    moduleKey: screen.module,
    capabilityKey: screen.capability,
  });

  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale as SupportedLocale, SEGMENT),
  );

  if (!property) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  const data = await propertyAnalytics(property.propertyId, search.range);

  if (!data) {
    return (
      <EmptyState
        description={t("analytics.noDataDesc")}
        title={t("analytics.noDataTitle")}
      />
    );
  }

  return (
    <AnalyticsDashboard
      data={data}
      locale={locale as SupportedLocale}
      property={property}
    />
  );
}
