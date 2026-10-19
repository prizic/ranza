"use client";

import type { SupportedLocale } from "@ranza/i18n";
import type { MonthReport } from "../../../server/analytics";
import { formatMonthTitle } from "../format";
import { MonthControl } from "./month-control";
import { PeriodStatus } from "./period-status";
import { RangeSelector } from "./range-selector";

/**
 * Which month, at which Property, and how settled it is. The status is one
 * line; what it rests on is said under the figures, so the figures are what a
 * small screen opens on (ANALYTICS-14).
 */
export function MonthHeader({
  locale,
  propertyName,
  report,
}: {
  locale: SupportedLocale;
  propertyName: string;
  report: MonthReport;
}) {
  return (
    <header className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="space-y-2">
          <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
            <bdi>{propertyName}</bdi>
          </p>
          <h2 className="text-3xl font-light tracking-tight sm:text-4xl md:text-5xl">
            {formatMonthTitle(report.month, locale)}
          </h2>
        </div>
        <MonthControl
          locale={locale}
          nextMonth={report.nextMonth}
          previousMonth={report.previousMonth}
        />
      </div>
      <PeriodStatus locale={locale} report={report} />
      <div>
        <RangeSelector current="month" />
      </div>
    </header>
  );
}
