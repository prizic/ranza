"use client";

import { useTranslations } from "next-intl";
import { cn } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import type {
  FigureChanges,
  Figures,
  MonthReport,
} from "../../../server/analytics";
import {
  formatMinorMoney,
  formatMonthTitle,
  formatPercentChange,
} from "../format";
import { MonthSection } from "./month-section";

function Row({
  change,
  label,
  strong = false,
  value,
}: {
  change?: { change: string; reference: string } | null;
  label: string;
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
function useComparison(report: MonthReport, locale: SupportedLocale) {
  const t = useTranslations("analytics.month");
  const prior = report.prior;
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
  report,
}: {
  figures: Figures;
  locale: SupportedLocale;
  report: MonthReport;
}) {
  const t = useTranslations("analytics.month");
  const comparison = useComparison(report, locale);
  const money = (minor: number | null) =>
    formatMinorMoney(minor, report.currency, locale);
  const room = figures.roomRevenue;

  return (
    <MonthSection title={t("revenue")}>
      <dl>
        <Row
          label={t("roomNightsCharged")}
          value={money(room?.grossMinor ?? null)}
        />
        <Row
          label={t("corrections")}
          value={money(room?.correctionsMinor ?? null)}
        />
        <Row
          change={comparison(
            (changes) => changes.roomRevenuePercent,
            (prior) => prior.roomRevenue?.netMinor ?? null,
          )}
          label={t("netRoomRevenue")}
          strong
          value={money(room?.netMinor ?? null)}
        />
        <Row
          change={comparison(
            (changes) => changes.otherRevenuePercent,
            (prior) => prior.otherRevenueMinor,
          )}
          label={t("otherRevenue")}
          value={money(figures.otherRevenueMinor)}
        />
        <Row
          change={comparison(
            (changes) => changes.totalRevenuePercent,
            (prior) => prior.totalRevenueMinor,
          )}
          label={t("totalRevenue")}
          strong
          value={money(figures.totalRevenueMinor)}
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
  report,
}: {
  figures: Figures;
  locale: SupportedLocale;
  report: MonthReport;
}) {
  const t = useTranslations("analytics.month");
  const tm = useTranslations("analytics");
  const comparison = useComparison(report, locale);
  const money = (minor: number | null) =>
    formatMinorMoney(minor, report.currency, locale);
  const payments = figures.payments;
  const methods: { label: string; minor: number | null }[] = [
    { label: tm("cash"), minor: payments?.cashMinor ?? null },
    { label: tm("card"), minor: payments?.cardMinor ?? null },
    { label: tm("bankTransfer"), minor: payments?.bankTransferMinor ?? null },
    { label: tm("other"), minor: payments?.otherMinor ?? null },
  ];

  return (
    <MonthSection title={t("collected")}>
      <dl>
        <Row
          label={t("revenueBooked")}
          value={money(figures.revenueBookedMinor)}
        />
        <Row
          change={comparison(
            (changes) => changes.collectedPercent,
            (prior) => prior.collectedMinor,
          )}
          label={t("moneyCollected")}
          value={money(figures.collectedMinor)}
        />
        <Row
          label={t("owedChange")}
          strong
          value={money(figures.differenceMinor)}
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
