"use client";

import { CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@ranza/ui";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import type { MonthReport } from "../../../server/analytics";
import { formatLongDate, formatMonthTitle } from "../format";
import { MonthControl } from "./month-control";
import { RangeSelector } from "./range-selector";

/**
 * Which month, at which Property, and how settled it is. An open month says
 * how many of its days have closed, because every figure below covers those
 * days only (AN-S2-04); a settled one says it is as of today, because a
 * correction can still move it (AN-S2-09).
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
  const t = useTranslations("analytics.month");

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
      {report.state === "open" ? (
        <div className="grid gap-2">
          <StatusBadge
            className="w-fit"
            icon={CalendarClock}
            label={t("monthToDate", {
              closed: formatNumber(report.daysClosed, locale),
              total: formatNumber(report.daysInMonth, locale),
            })}
            tone="info"
          />
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("openNote")}
          </p>
        </div>
      ) : null}
      {report.state !== "no_activity" ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("asOf", { date: formatLongDate(report.today, locale) })}
        </p>
      ) : null}
      <div>
        <RangeSelector current="month" />
      </div>
    </header>
  );
}
