"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import type { PeriodReport, PriorMonth } from "../../../server/analytics";
import { unchargedProblem, type Problem } from "../problem";
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
  problem,
  value,
}: {
  arithmetic: string;
  comparison: Comparison | null;
  label: string;
  /** A reason the figure is not what it appears, with the way to see why. */
  problem?: Problem | null;
  value: string;
}) {
  return (
    <div
      className="flex flex-col rounded-[2rem] border border-slate-100 bg-card p-4 sm:p-5 md:p-6"
      data-figure
    >
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-3xl leading-none font-light tracking-tight tabular-nums sm:mt-4 xl:text-4xl 2xl:text-5xl">
        <bdi>{value}</bdi>
      </p>
      <p className="mt-2 text-xs text-muted-foreground sm:mt-3 sm:text-sm">
        {arithmetic}
      </p>
      {problem ? (
        <p className="mt-1 text-xs text-warning sm:text-sm" data-problem>
          {problem.text}{" "}
          <Link className="font-medium underline" href={problem.href}>
            {problem.link}
          </Link>
        </p>
      ) : null}
      {comparison ? (
        <p className="mt-auto pt-3 text-xs sm:pt-4 sm:text-sm">
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
 * a dash that says so, never zero and never infinity (AN-S2-03, AN-S2-07). So
 * is revenue when nights were slept and none has a charge: that is not a
 * revenue of zero (ANALYTICS-02).
 *
 * Occupancy is counted over every day so far; the rates over the closed days,
 * and each says which.
 *
 * The money figures are not here at all for a viewer who may not read money.
 */
export function HeadlineFigures({
  locale,
  prior,
  report,
}: {
  locale: SupportedLocale;
  /** The month before, when there is one to set beside this: a month's, never a window's. */
  prior: PriorMonth | null;
  report: PeriodReport;
}) {
  const t = useTranslations("analytics.month");
  const figures = report.figures;
  if (!figures) return null;

  const priorFigures = prior?.figures ?? null;
  const priorMonth = prior ? formatMonthTitle(prior.month, locale) : "";
  const count = (value: number) => formatNumber(value, locale);
  const money = (minor: number | null) =>
    formatMinorMoney(minor, report.currency, locale);
  const roomNet = figures.roomRevenue?.netMinor ?? null;
  const problem = unchargedProblem(figures, t);

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
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
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
                  ? figures.roomRevenueUnknown
                    ? t("revenueUnknown", {
                        count: figures.unchargedGuestNights,
                      })
                    : t("adrNone")
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
                  ? figures.roomRevenueUnknown
                    ? t("revenueUnknown", {
                        count: figures.unchargedGuestNights,
                      })
                    : t("revParNone")
                  : t("revParArithmetic", {
                      revenue: money(roomNet),
                      nights: count(figures.closedAvailableNights),
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
              problem={figures.roomRevenueUnknown ? null : problem}
              value={money(figures.revParMinor)}
            />
          </>
        ) : null}
      </div>
      {prior && !priorFigures ? (
        <p className="text-sm text-muted-foreground">
          {t("noPrior", { month: priorMonth })}
        </p>
      ) : null}
      {prior?.sameElapsedDays && priorFigures ? (
        <p className="text-sm text-muted-foreground">
          {t("sameElapsedDays", { month: priorMonth })}
        </p>
      ) : null}
    </section>
  );
}
