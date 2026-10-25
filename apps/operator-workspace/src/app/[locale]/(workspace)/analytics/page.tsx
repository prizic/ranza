import { notFound } from "next/navigation";
import {
  isSupportedLocale,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  MonthReportView,
  WindowReportView,
} from "../../../../features/analytics";
import { gateOf, screenFor } from "../../../../lib/screens";
import { ScreenDenied } from "../screen-denied";
import { resolveAnalyticsView } from "../../../../server/analytics";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  propertyDayDetail,
  propertyMonthReport,
  propertyWindowReport,
  requireViewer,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";

const SEGMENT = "analytics";

/**
 * Analytics — Property operational and financial reporting.
 *
 * Opens on a calendar month (`?month=YYYY-MM`, the current one by default),
 * explained from the Property's business days; `?range=today|7d|30d` is the
 * trailing-window view beside it, explained the same way (AN-S2-19,
 * ANALYTICS-09). `?day=YYYY-MM-DD` opens one day of the month shown and is
 * ignored for any other (AN-S3-06).
 *
 * Operational metrics (occupied nights, occupancy rate %) are available to any
 * staff member with Property access. Commercial and financial figures (room
 * revenue, other revenue, ADR, RevPAR, and payments) are strictly gated by
 * 'finance.manage_folio'.
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

  const properties = await screenProperties(gateOf("analytics"));

  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale as SupportedLocale, SEGMENT),
  );

  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(
          gateOf("analytics"),
          (await searchParams).property,
        )}
        locale={locale}
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
    // A Stay is opened where its price is fixed, which is the Reservations
    // screen: offered to a viewer who reaches it and to nobody else.
    const reachesReservations = (
      await screenProperties(gateOf("reservations"))
    ).some((reachable) => reachable.propertyId === property.propertyId);
    const reachesFinance = (await screenProperties(gateOf("finance"))).some(
      (reachable) => reachable.propertyId === property.propertyId,
    );
    return (
      <MonthReportView
        detail={detail}
        financeHref={
          reachesFinance
            ? `${localizeHref(locale as SupportedLocale, "finance")}?property=${property.propertyId}`
            : null
        }
        locale={locale as SupportedLocale}
        propertyName={property.propertyName}
        report={report}
        reservationsHref={
          reachesReservations
            ? `${localizeHref(locale as SupportedLocale, "reservations")}?property=${property.propertyId}`
            : null
        }
      />
    );
  }

  const report = await propertyWindowReport(property.propertyId, view.range);
  if (!report) return unavailable;

  return (
    <WindowReportView
      locale={locale as SupportedLocale}
      propertyName={property.propertyName}
      report={report}
    />
  );
}
