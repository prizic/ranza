"use client";

import {
  BedDouble,
  DollarSign,
  Percent,
  Receipt,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import type { EntitledProperty } from "@ranza/core";
import type { PropertyAnalytics } from "../../../server/analytics";
import {
  formatMinorMoney,
  formatPercentValue,
  formatShortDate,
} from "../format";
import { DailyBreakdown } from "./daily-breakdown";
import { KpiCard } from "./kpi-card";
import { PaymentsBreakdown } from "./payments-breakdown";
import { RangeSelector } from "./range-selector";

interface AnalyticsDashboardProps {
  data: PropertyAnalytics;
  locale: SupportedLocale;
  property: EntitledProperty;
}

export function AnalyticsDashboard({
  data,
  locale,
  property,
}: AnalyticsDashboardProps) {
  const t = useTranslations("analytics");

  const windowLabel =
    data.startDate === data.endDate
      ? formatShortDate(data.startDate, locale)
      : `${formatShortDate(data.startDate, locale)} – ${formatShortDate(data.endDate, locale)}`;

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">
              {t("heading")}
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {windowLabel}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {property.propertyName}
            </span>{" "}
            · {t("subheading")}
          </p>
        </div>

        <div className="shrink-0">
          <RangeSelector currentRange={data.range} />
        </div>
      </div>

      {/* Permission Masking Notice */}
      {!data.mayReadMoney && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/80 p-3.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <ShieldAlert
            aria-hidden="true"
            className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
          />
          <span>{t("financialsMaskedNotice")}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Occupancy Rate */}
        <KpiCard
          description={t("occupancyRateDesc")}
          extra={
            <span>
              {data.occupiedRoomNights} / {data.availableRoomNights}{" "}
              {t("occupiedNights")}
            </span>
          }
          icon={Percent}
          title={t("occupancyRate")}
          tone="emerald"
          value={formatPercentValue(data.occupancyRatePercent, locale)}
        />

        {/* Room Revenue */}
        <KpiCard
          description={t("roomRevenueDesc")}
          extra={
            <span>
              {data.totalSellableUnits} {t("sellableUnits")}
            </span>
          }
          icon={BedDouble}
          masked={!data.mayReadMoney}
          title={t("roomRevenue")}
          tone="primary"
          value={formatMinorMoney(data.roomRevenueMinor, data.currency, locale)}
        />

        {/* ADR */}
        <KpiCard
          description={t("adrDesc")}
          icon={TrendingUp}
          masked={!data.mayReadMoney}
          title={t("adr")}
          value={formatMinorMoney(data.adrMinor, data.currency, locale)}
        />

        {/* RevPAR */}
        <KpiCard
          description={t("revParDesc")}
          icon={DollarSign}
          masked={!data.mayReadMoney}
          title={t("revPar")}
          value={formatMinorMoney(data.revParMinor, data.currency, locale)}
        />

        {/* Total Revenue */}
        <KpiCard
          description={t("totalRevenue")}
          icon={Receipt}
          masked={!data.mayReadMoney}
          title={t("totalRevenue")}
          value={formatMinorMoney(
            data.totalRevenueMinor,
            data.currency,
            locale,
          )}
        />

        {/* Payments Collected */}
        <KpiCard
          description={t("netPaymentsDesc")}
          icon={Wallet}
          masked={!data.mayReadMoney}
          title={t("netPayments")}
          value={formatMinorMoney(data.netPaymentsMinor, data.currency, locale)}
        />
      </div>

      {/* Daily Breakdown and Payments Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div
          className={
            data.mayReadMoney && data.paymentsByMethod
              ? "lg:col-span-8"
              : "lg:col-span-12"
          }
        >
          <DailyBreakdown
            currency={data.currency}
            locale={locale}
            mayReadMoney={data.mayReadMoney}
            series={data.dailySeries}
          />
        </div>

        {data.mayReadMoney && data.paymentsByMethod && (
          <div className="lg:col-span-4">
            <PaymentsBreakdown
              breakdown={data.paymentsByMethod}
              currency={data.currency}
              locale={locale}
            />
          </div>
        )}
      </div>
    </div>
  );
}
