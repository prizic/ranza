import { notFound } from "next/navigation";
import {
  isSupportedLocale,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  AnalyticsDashboard,
  MonthReportView,
} from "../../../../features/analytics";
import { screenFor } from "../../../../lib/screens";
import { resolveAnalyticsView } from "../../../../server/analytics";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  entitledProperties,
  propertyAnalytics,
  propertyDayDetail,
  propertyMonthReport,
  requireViewer,
} from "../../../../server/viewer";

const SEGMENT = "analytics";

/**
 * Analytics — Property operational and financial reporting.
 *
 * Opens on a calendar month (`?month=YYYY-MM`, the current one by default),
 * explained from the Property's closed business days; `?range=today|7d|30d`
 * is the trailing-window view beside it (AN-S2-19). `?day=YYYY-MM-DD` opens
 * one day of the month shown and is ignored for any other (AN-S3-06).
 *
 * Operational metrics (sellable inventory, occupied room nights, occupancy rate %)
 * are available to any staff member with Property access.
 * Commercial and financial figures (room revenue, other revenue, ADR, RevPAR,
 * and payments) are strictly gated by 'finance.manage_folio'.
 */
export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    property?: string;
    range?: string;
    month?: string;
    day?: string;
  }>;
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

  // A Property the viewer does not reach is not an empty month (AN-S2-16).
  const unavailable = (
    <EmptyState
      description={t("analytics.month.notFoundDescription")}
      title={t("analytics.month.notFoundTitle")}
    />
  );

  const view = resolveAnalyticsView(search);
  if (view.kind === "month") {
    const report = await propertyMonthReport(property.propertyId, view.month);
    if (!report) return unavailable;
    const opened = report.days.find(
      (day) => day.date === search.day && day.state !== "future",
    );
    const detail = opened
      ? await propertyDayDetail(property.propertyId, opened.date)
      : null;
    return (
      <MonthReportView
        detail={detail}
        locale={locale as SupportedLocale}
        propertyName={property.propertyName}
        report={report}
      />
    );
  }

  const data = await propertyAnalytics(property.propertyId, view.range);
  if (!data) return unavailable;

  return (
    <AnalyticsDashboard
      data={data}
      locale={locale as SupportedLocale}
      property={property}
    />
  );
}
