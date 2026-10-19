"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import type {
  FigureChanges,
  Figures,
  PeriodReport,
  PriorMonth,
} from "../../../server/analytics";
import {
  formatMinorMoney,
  formatMonthTitle,
  formatPercentChange,
} from "../format";
import { unchargedProblem, type Problem } from "../problem";
import { MonthSection } from "./month-section";

function Row({
  change,
  label,
  problem,
  strong = false,
  value,
}: {
  change?: { change: string; reference: string } | null;
  label: string;
  /** Why the figure is not what it appears, with the way to see why. */
  problem?: Problem | { text: string } | null;
  strong?: boolean;
  value: string;
}) {
  return (
    <div
      className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0"
      data-row
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-end tabular-nums",
          strong ? "text-2xl font-light" : "text-base",
        )}
      >
        <bdi>{value}</bdi>
      </dd>
      {problem ? (
        <dd className="col-span-2 text-end text-xs text-warning" data-problem>
          {problem.text}
          {"href" in problem ? (
            <>
              {" "}
              <Link className="font-medium underline" href={problem.href}>
                {problem.link}
              </Link>
            </>
          ) : null}
        </dd>
      ) : null}
      {change ? (
        <dd className="col-span-2 text-end text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            <bdi>{change.change}</bdi>
          </span>{" "}
          {change.reference}
        </dd>
      ) : null}
    </div>
  );
}

/** What the prior month's figure was and how this one moved from it, when there is one. */
function useComparison(
  report: PeriodReport,
  prior: PriorMonth | null,
  locale: SupportedLocale,
) {
  const t = useTranslations("analytics.month");
  const priorFigures: Figures | null = prior?.figures ?? null;
  return (
    pick: (changes: FigureChanges) => number | null,
    priorMinor: (figures: Figures) => number | null,
  ) => {
    if (!prior || !priorFigures) return null;
    return {
      change: formatPercentChange(
        prior.changes ? pick(prior.changes) : null,
        locale,
      ),
      reference: t("againstPrior", {
        month: formatMonthTitle(prior.month, locale),
        value: formatMinorMoney(
          priorMinor(priorFigures),
          report.currency,
          locale,
        ),
      }),
    };
  };
}

/**
 * Room revenue as charged, corrected and net, then the rest of what was booked.
 * A correction sits on the night it corrects, so it is shown as its own line
 * and not folded away (AN-S2-09, AN-S2-10).
 */
export function RevenueSection({
  figures,
  locale,
  prior,
  report,
}: {
  figures: Figures;
  locale: SupportedLocale;
  prior: PriorMonth | null;
  report: PeriodReport;
}) {
  const t = useTranslations("analytics.month");
  const comparison = useComparison(report, prior, locale);
  const room = figures.roomRevenue;
  const noClosedDays = report.daysClosed === 0;
  // Nights were slept and none has a charge: there is no room revenue to
  // speak of, which is not a revenue of zero (ANALYTICS-02).
  const unknown = figures.roomRevenueUnknown;
  const totalUnknown = unknown && (figures.otherRevenueMinor ?? 0) === 0;
  const money = (minor: number | null, hide = false) =>
    formatMinorMoney(hide ? null : minor, report.currency, locale);
  const problem = unchargedProblem(figures, t);
  const reason = {
    text: t("revenueUnknown", { count: figures.unchargedGuestNights }),
    link: t("seeUncharged"),
    href: "#analytics-uncharged",
  };

  return (
    <MonthSection title={t("revenue")}>
      {noClosedDays ? (
        <p className="mb-2 max-w-prose text-sm text-muted-foreground">
          {t("noClosedDays")}
        </p>
      ) : null}
      <dl>
        <Row
          label={t("roomNightsCharged")}
          value={money(room?.grossMinor ?? null, unknown)}
        />
        <Row
          label={t("corrections")}
          value={money(room?.correctionsMinor ?? null, unknown)}
        />
        <Row
          change={comparison(
            (changes) => changes.roomRevenuePercent,
            (priorFigures) => priorFigures.roomRevenue?.netMinor ?? null,
          )}
          label={t("netRoomRevenue")}
          problem={unknown ? reason : problem}
          strong
          value={money(room?.netMinor ?? null, unknown)}
        />
        <Row
          change={comparison(
            (changes) => changes.otherRevenuePercent,
            (priorFigures) => priorFigures.otherRevenueMinor,
          )}
          label={t("otherRevenue")}
          value={money(figures.otherRevenueMinor)}
        />
        <Row
          change={comparison(
            (changes) => changes.totalRevenuePercent,
            (priorFigures) => priorFigures.totalRevenueMinor,
          )}
          label={t("totalRevenue")}
          problem={totalUnknown ? reason : problem}
          strong
          value={money(figures.totalRevenueMinor, totalUnknown)}
        />
      </dl>
    </MonthSection>
  );
}

/**
 * Revenue booked against money collected, and the difference worded as the
 * change in what Guests owe. It never claims to be a receivables report
 * (AN-S2-24); how the money was paid follows (AN-S2-13).
 */
export function CollectedSection({
  figures,
  locale,
  prior,
  report,
}: {
  figures: Figures;
  locale: SupportedLocale;
  prior: PriorMonth | null;
  report: PeriodReport;
}) {
  const t = useTranslations("analytics.month");
  const tm = useTranslations("analytics");
  const comparison = useComparison(report, prior, locale);
  const money = (minor: number | null) =>
    formatMinorMoney(minor, report.currency, locale);
  // Booked is unknown when revenue is, and so is what Guests owe on it.
  const bookedUnknown =
    figures.roomRevenueUnknown && (figures.otherRevenueMinor ?? 0) === 0;
  const noClosedDays = report.daysClosed === 0;
  const payments = figures.payments;
  const methods: { label: string; minor: number | null }[] = [
    { label: tm("cash"), minor: payments?.cashMinor ?? null },
    { label: tm("card"), minor: payments?.cardMinor ?? null },
    { label: tm("bankTransfer"), minor: payments?.bankTransferMinor ?? null },
    { label: tm("other"), minor: payments?.otherMinor ?? null },
  ];

  return (
    <MonthSection title={t("collected")}>
      {noClosedDays ? (
        <p className="mb-2 max-w-prose text-sm text-muted-foreground">
          {t("noClosedDays")}
        </p>
      ) : null}
      <dl>
        <Row
          label={t("revenueBooked")}
          value={money(bookedUnknown ? null : figures.revenueBookedMinor)}
        />
        <Row
          change={comparison(
            (changes) => changes.collectedPercent,
            (priorFigures) => priorFigures.collectedMinor,
          )}
          label={t("moneyCollected")}
          value={money(figures.collectedMinor)}
        />
        <Row
          label={t("owedChange")}
          strong
          value={money(bookedUnknown ? null : figures.differenceMinor)}
        />
      </dl>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("owedChangeNote")}
      </p>
      <h4 className="mt-6 mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("collectedByMethod")}
      </h4>
      <dl>
        {methods.map(({ label, minor }) => (
          <Row key={label} label={label} value={money(minor)} />
        ))}
      </dl>
    </MonthSection>
  );
}
