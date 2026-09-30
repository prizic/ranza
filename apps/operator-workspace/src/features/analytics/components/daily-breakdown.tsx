"use client";

import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import type { DailyMetric } from "../../../server/analytics";
import {
  formatMinorMoney,
  formatPercentValue,
  formatShortDate,
} from "../format";

interface DailyBreakdownProps {
  series: DailyMetric[];
  currency: string;
  locale: SupportedLocale;
  mayReadMoney: boolean;
}

export function DailyBreakdown({
  series,
  currency,
  locale,
  mayReadMoney,
}: DailyBreakdownProps) {
  const t = useTranslations("analytics");

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/60 sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t("dailyBreakdownTitle")}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("dailyBreakdownDesc")}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-medium text-slate-400 dark:border-slate-800/80 dark:text-slate-500">
              <th className="py-2.5 pe-4 ps-2 text-start font-medium">
                {t("dateCol")}
              </th>
              <th className="px-4 py-2.5 text-end font-medium">
                {t("occupiedUnitsCol")}
              </th>
              <th className="px-4 py-2.5 text-end font-medium">
                {t("availableUnitsCol")}
              </th>
              <th className="px-4 py-2.5 text-end font-medium">
                {t("occupancyCol")}
              </th>
              <th className="py-2.5 pe-2 ps-4 text-end font-medium">
                {t("roomRevenueCol")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-slate-700 dark:divide-slate-800/50 dark:text-slate-300">
            {series.map((row) => (
              <tr
                key={row.date}
                className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
              >
                <td className="py-3 pe-4 ps-2 font-medium text-slate-900 dark:text-slate-100">
                  {formatShortDate(row.date, locale)}
                </td>
                <td className="px-4 py-3 text-end font-mono text-xs sm:text-sm">
                  {row.occupiedUnits}
                </td>
                <td className="px-4 py-3 text-end font-mono text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  {row.availableUnits}
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="inline-flex items-center justify-end gap-2">
                    <span className="font-mono text-xs sm:text-sm">
                      {formatPercentValue(row.occupancyRatePercent, locale)}
                    </span>
                    <div
                      aria-hidden="true"
                      className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 sm:w-16"
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, row.occupancyRatePercent))}%`,
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-3 pe-2 ps-4 text-end font-mono text-xs sm:text-sm font-medium">
                  {mayReadMoney ? (
                    formatMinorMoney(row.roomRevenueMinor, currency, locale)
                  ) : (
                    <span className="text-slate-400">••••••</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
