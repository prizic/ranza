"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import { isPartial, type Coverage, type PortfolioSummary } from "../derive";
import { formatBalance, formatCount, formatShare } from "../format";

/**
 * The three figures above the Properties.
 *
 * Each is a sum of what the read returned, and each says when it was counted
 * at fewer Properties than are listed. Money is a line per currency and is
 * never added across them (PF-S1-13).
 */
export function SummaryStats({
  locale,
  summary,
}: {
  locale: SupportedLocale;
  summary: PortfolioSummary;
}) {
  const t = useTranslations("portfolio");
  const { occupancy, maintenance, balances } = summary;

  return (
    <section className="grid gap-4 md:grid-cols-3">
      <SummaryCard
        coverage={occupancy.coverage}
        locale={locale}
        note={
          occupancy.coverage.reporting === 0
            ? t("notReporting")
            : occupancy.percent === null
              ? t("noSellableUnits")
              : formatShare(occupancy.percent, locale)
        }
        title={t("occupancyTitle")}
      >
        {occupancy.coverage.reporting === 0 ? (
          "—"
        ) : (
          <>
            {formatCount(occupancy.occupiedUnits, locale)}
            <span className="text-xl text-muted-foreground">
              {" "}
              / {formatCount(occupancy.sellableUnits, locale)}
            </span>
          </>
        )}
      </SummaryCard>

      <SummaryCard
        locale={locale}
        note={t("moneyOwedNote")}
        title={t("moneyOwedTitle")}
      >
        {balances.length === 0 ? (
          <span className="inline-flex items-center gap-2 text-2xl text-muted-foreground">
            <Lock aria-hidden="true" className="size-5" />
            {t("hidden")}
          </span>
        ) : (
          <ul className="grid gap-1 text-3xl md:text-4xl">
            {balances.map(({ balanceMinor, currency }) => (
              <li data-currency={currency} key={currency}>
                {formatBalance(balanceMinor, currency, locale)}
              </li>
            ))}
          </ul>
        )}
      </SummaryCard>

      <SummaryCard
        coverage={maintenance.coverage}
        locale={locale}
        note={
          maintenance.coverage.reporting === 0
            ? t("notReporting")
            : t("maintenanceNote")
        }
        title={t("maintenanceTitle")}
      >
        {maintenance.coverage.reporting === 0
          ? "—"
          : formatCount(maintenance.openRequests, locale)}
      </SummaryCard>
    </section>
  );
}

function SummaryCard({
  children,
  coverage,
  locale,
  note,
  title,
}: {
  children: ReactNode;
  coverage?: Coverage;
  locale: SupportedLocale;
  note: string;
  title: string;
}) {
  const t = useTranslations("portfolio");
  return (
    <div
      aria-label={title}
      className="flex min-h-40 flex-col rounded-[2rem] border border-slate-100 bg-card p-6"
      role="group"
    >
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </p>
      <div className="mt-4 text-4xl leading-none font-light tracking-tight tabular-nums md:text-5xl">
        {children}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{note}</p>
      {coverage && isPartial(coverage) ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {t("coverage", {
            reporting: formatCount(coverage.reporting, locale),
            total: formatCount(coverage.total, locale),
          })}
        </p>
      ) : null}
    </div>
  );
}
