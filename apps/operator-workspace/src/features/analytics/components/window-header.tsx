"use client";

import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import type { WindowReport } from "../../../server/analytics";
import { formatShortDate } from "../format";
import { PeriodStatus } from "./period-status";
import { RangeSelector } from "./range-selector";

/**
 * Which window, at which Property, and how settled it is: the header of a
 * month with the days it spans where the month's name would be.
 */
export function WindowHeader({
  locale,
  propertyName,
  report,
}: {
  locale: SupportedLocale;
  propertyName: string;
  report: WindowReport;
}) {
  const t = useTranslations("analytics.window");
  const span =
    report.startDate === report.endDate
      ? formatShortDate(report.startDate, locale)
      : t("span", {
          from: formatShortDate(report.startDate, locale),
          to: formatShortDate(report.endDate, locale),
        });

  return (
    <header className="grid gap-4">
      <div className="space-y-2">
        <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
          <bdi>{propertyName}</bdi>
        </p>
        <h2 className="text-3xl font-light tracking-tight sm:text-4xl md:text-5xl">
          {t(report.range)}
        </h2>
        <p className="text-sm text-muted-foreground">{span}</p>
      </div>
      <PeriodStatus locale={locale} report={report} windowed />
      <div>
        <RangeSelector current={report.range} />
      </div>
    </header>
  );
}
