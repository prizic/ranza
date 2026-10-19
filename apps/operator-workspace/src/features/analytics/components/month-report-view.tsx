"use client";

import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import type { DayDetail, MonthReport } from "../../../server/analytics";
import { formatMonthTitle } from "../format";
import { DayDetailSheet } from "./day-detail-sheet";
import { MonthHeader } from "./month-header";
import { PeriodBody } from "./period-body";

/**
 * One calendar month of a Property, explained (docs/features/analytics, slice 2).
 *
 * The month is explained below its headline: by unit type, then by the nights
 * that earned no charge, then day by day, and any day opens (AN-S3-01 to 04).
 * A day's detail is shown only under the month it belongs to, whatever the
 * address says (AN-S3-06).
 */
export function MonthReportView({
  detail = null,
  locale,
  propertyName,
  reservationsHref = null,
  report,
}: {
  /** The day opened from the table, read by the server from `?day=`. */
  detail?: DayDetail | null;
  locale: SupportedLocale;
  propertyName: string;
  /**
   * The Reservations screen at this Property, when the viewer reaches it, so a
   * Stay can be opened where its price is fixed (ANALYTICS-11).
   */
  reservationsHref?: string | null;
  report: MonthReport;
}) {
  const t = useTranslations("analytics");
  const openDay =
    detail !== null && detail.date.startsWith(`${report.month}-`)
      ? detail
      : null;
  const dayIndex = openDay
    ? report.days.findIndex((day) => day.date === openDay.date)
    : -1;
  const previousDay = report.days[dayIndex - 1]?.date ?? null;
  const following = report.days[dayIndex + 1];
  const nextDay =
    following && following.state !== "future" ? following.date : null;

  return (
    <div className="flex flex-col gap-6">
      <MonthHeader
        locale={locale}
        propertyName={propertyName}
        report={report}
      />
      <PeriodBody
        emptyTitle={t("month.noActivityTitle", {
          month: formatMonthTitle(report.month, locale),
        })}
        locale={locale}
        prior={report.prior}
        report={report}
      />
      {openDay ? (
        <DayDetailSheet
          detail={openDay}
          locale={locale}
          nextDay={nextDay}
          previousDay={previousDay}
          reservationsHref={reservationsHref}
        />
      ) : null}
    </div>
  );
}
