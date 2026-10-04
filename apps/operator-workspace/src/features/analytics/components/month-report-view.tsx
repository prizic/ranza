"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import type { DayDetail, MonthReport } from "../../../server/analytics";
import { formatMonthTitle } from "../format";
import { HeadlineFigures } from "./headline-figures";
import { DayDetailSheet } from "./day-detail-sheet";
import { MonthDaysTable } from "./month-days-table";
import { MonthHeader } from "./month-header";
import { CollectedSection, RevenueSection } from "./money-sections";
import { NightsSection } from "./nights-section";
import { UnchargedSection } from "./uncharged-section";
import { UnitTypeSection } from "./unit-type-section";

/**
 * One calendar month of a Property, explained (docs/features/analytics, slice 2).
 *
 * A month with no activity is said to have had none and shows no rate: nothing
 * happening is not zero percent (AN-S2-03). A viewer who may not read money
 * gets the nights and the occupancy, and one plain sentence saying why the rest
 * is absent — no padlocks, no blurred stand-ins (AN-S2-15).
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
  report,
}: {
  /** The day opened from the table, read by the server from `?day=`. */
  detail?: DayDetail | null;
  locale: SupportedLocale;
  propertyName: string;
  report: MonthReport;
}) {
  const t = useTranslations("analytics");
  const figures = report.figures;
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
      {figures === null ? (
        <EmptyState
          description={t("month.noActivityDescription")}
          title={t("month.noActivityTitle", {
            month: formatMonthTitle(report.month, locale),
          })}
        />
      ) : (
        <>
          {report.mayReadMoney ? null : (
            <p
              className="max-w-prose border-s-2 border-border ps-4 text-sm text-muted-foreground"
              role="status"
            >
              {t("financialsMaskedNotice")}
            </p>
          )}
          <HeadlineFigures locale={locale} report={report} />
          {report.mayReadMoney ? (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <RevenueSection
                figures={figures}
                locale={locale}
                report={report}
              />
              <CollectedSection
                figures={figures}
                locale={locale}
                report={report}
              />
            </div>
          ) : null}
          <NightsSection
            figures={figures}
            locale={locale}
            mayReadMoney={report.mayReadMoney}
          />
          <UnitTypeSection
            currency={report.currency}
            figures={figures}
            locale={locale}
            mayReadMoney={report.mayReadMoney}
            rows={report.byUnitType}
          />
          <UnchargedSection rows={report.unchargedNights} />
          <MonthDaysTable
            currency={report.currency}
            days={report.days}
            figures={figures}
            locale={locale}
            mayReadMoney={report.mayReadMoney}
          />
        </>
      )}
      {openDay ? (
        <DayDetailSheet
          detail={openDay}
          locale={locale}
          nextDay={nextDay}
          previousDay={previousDay}
        />
      ) : null}
    </div>
  );
}
