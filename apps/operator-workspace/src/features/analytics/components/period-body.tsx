"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import type { PeriodReport, PriorMonth } from "../../../server/analytics";
import { HeadlineFigures } from "./headline-figures";
import { MonthDaysTable } from "./month-days-table";
import { CollectedSection, RevenueSection } from "./money-sections";
import { NightsSection } from "./nights-section";
import { PeriodNotes } from "./period-status";
import { UnchargedSection } from "./uncharged-section";
import { UnitTypeSection } from "./unit-type-section";

/**
 * What a month and a trailing window say, said once: the headline, the notes
 * that say what it rests on, revenue and what was collected, the nights, the
 * unit types, the nights with no charge and the days. A window is a month with
 * a different span and nothing to be compared with, not a second design with
 * its own words and its own rules (ANALYTICS-09).
 *
 * A period with no activity says it had none and shows no rate: nothing
 * happening is not zero percent (AN-S2-03). A viewer who may not read money
 * gets the nights and the occupancy, and one plain sentence saying why the rest
 * is absent — no padlocks, no blurred stand-ins (AN-S2-15).
 */
export function PeriodBody({
  emptyTitle,
  locale,
  prior,
  report,
}: {
  /** What a period with no activity is called in its own words. */
  emptyTitle: string;
  locale: SupportedLocale;
  /** The month before, for a month; null for a window. */
  prior: PriorMonth | null;
  report: PeriodReport;
}) {
  const t = useTranslations("analytics");
  const figures = report.figures;

  if (figures === null) {
    return (
      <EmptyState
        description={t("month.noActivityDescription")}
        title={emptyTitle}
      />
    );
  }

  return (
    <>
      <HeadlineFigures locale={locale} prior={prior} report={report} />
      <PeriodNotes
        locale={locale}
        propertyId={report.propertyId}
        report={report}
      />
      {report.mayReadMoney ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <RevenueSection
            figures={figures}
            locale={locale}
            prior={prior}
            report={report}
          />
          <CollectedSection
            figures={figures}
            locale={locale}
            prior={prior}
            report={report}
          />
        </div>
      ) : (
        <p
          className="max-w-prose border-s-2 border-border ps-4 text-sm text-muted-foreground"
          role="status"
        >
          {t("financialsMaskedNotice")}
        </p>
      )}
      <NightsSection
        figures={figures}
        locale={locale}
        mayReadMoney={report.mayReadMoney}
      />
      <UnitTypeSection
        currency={report.currency}
        figures={figures}
        locale={locale}
        mayReadMoney={report.mayReadMoney}
        rows={report.byUnitType}
      />
      <UnchargedSection rows={report.unchargedNights} />
      <MonthDaysTable
        currency={report.currency}
        days={report.days}
        figures={figures}
        locale={locale}
        mayReadMoney={report.mayReadMoney}
      />
    </>
  );
}
