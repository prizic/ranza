"use client";

import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import type { MonthReport } from "../../../server/analytics";
import {
  formatMinorMoney,
  formatMonthTitle,
  formatPercentChange,
  formatPercentValue,
  formatPointValue,
} from "../format";

interface Comparison {
  change: string;
  reference: string;
}

function HeadlineFigure({
  arithmetic,
  comparison,
  label,
  value,
}: {
  arithmetic: string;
  comparison: Comparison | null;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex flex-col rounded-[2rem] border border-slate-100 bg-card p-5 md:p-6"
      data-figure
    >
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-4 text-4xl leading-none font-light tracking-tight tabular-nums md:text-5xl">
        <bdi>{value}</bdi>
      </p>
      <p className="mt-3 text-sm text-muted-foreground">{arithmetic}</p>
      {comparison ? (
        <p className="mt-auto pt-4 text-sm">
          <span className="font-medium tabular-nums">
            <bdi>{comparison.change}</bdi>
          </span>{" "}
          <span className="text-muted-foreground">{comparison.reference}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Occupancy, ADR and RevPAR, each with the division it is written under it, so
 * a reader can check it by hand (AN-S2-20). A rate with nothing to divide by is
 * a dash that says so, never zero and never infinity (AN-S2-03, AN-S2-07).
 *
 * The money figures are not here at all for a viewer who may not read money.
 */
export function HeadlineFigures({
  locale,
  report,
}: {
  locale: SupportedLocale;
  report: MonthReport;
}) {
  const t = useTranslations("analytics.month");
  const figures = report.figures;
  if (!figures) return null;

  const prior = report.prior;
  const priorFigures = prior?.figures ?? null;
  const priorMonth = prior ? formatMonthTitle(prior.month, locale) : "";
  const count = (value: number) => formatNumber(value, locale);
  const money = (minor: number | null) =>
    formatMinorMoney(minor, report.currency, locale);
  const roomNet = figures.roomRevenue?.netMinor ?? null;

  const against = (change: string, priorValue: string): Comparison | null =>
    priorFigures
      ? {
          change,
          reference: t("againstPrior", {
            month: priorMonth,
            value: priorValue,
          }),
        }
      : null;

  const points = formatPointValue(
    prior?.changes?.occupancyPoints ?? null,
    locale,
  );
  const occupancy = (value: number | null) =>
    value === null ? "—" : formatPercentValue(value, locale);

  return (
    <section aria-label={t("headline")} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <HeadlineFigure
          arithmetic={
            figures.occupancyPercent === null
              ? t("occupancyNone")
              : t("occupancyArithmetic", {
                  occupied: count(figures.occupiedNights),
                  available: count(figures.availableNights),
                })
          }
          comparison={against(
            points === null ? "—" : t("pointsChange", { value: points }),
            occupancy(priorFigures?.occupancyPercent ?? null),
          )}
          label={t("occupancy")}
          value={occupancy(figures.occupancyPercent)}
        />
        {report.mayReadMoney ? (
          <>
            <HeadlineFigure
              arithmetic={
                figures.adrMinor === null
                  ? t("adrNone")
                  : t("adrArithmetic", {
                      revenue: money(roomNet),
                      nights: count(figures.chargedGuestNights),
                    })
              }
              comparison={against(
                formatPercentChange(prior?.changes?.adrPercent ?? null, locale),
                money(priorFigures?.adrMinor ?? null),
              )}
              label={t("adr")}
              value={money(figures.adrMinor)}
            />
            <HeadlineFigure
              arithmetic={
                figures.revParMinor === null
                  ? t("revParNone")
                  : t("revParArithmetic", {
                      revenue: money(roomNet),
                      nights: count(figures.availableNights),
                    })
              }
              comparison={against(
                formatPercentChange(
                  prior?.changes?.revParPercent ?? null,
                  locale,
                ),
                money(priorFigures?.revParMinor ?? null),
              )}
              label={t("revPar")}
              value={money(figures.revParMinor)}
            />
          </>
        ) : null}
      </div>
      {prior && !priorFigures ? (
        <p className="text-sm text-muted-foreground">{t("noPrior")}</p>
      ) : null}
      {prior?.sameElapsedDays && priorFigures ? (
        <p className="text-sm text-muted-foreground">
          {t("sameElapsedDays", { month: priorMonth })}
        </p>
      ) : null}
    </section>
  );
}
