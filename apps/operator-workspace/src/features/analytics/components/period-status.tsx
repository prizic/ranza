"use client";

import Link from "next/link";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@ranza/ui";
import { formatNumber, localizeHref, type SupportedLocale } from "@ranza/i18n";
import type { PeriodReport } from "../../../server/analytics";
import { formatLongDate } from "../format";

/**
 * How settled a period is, said in one line under its title: how many of its
 * days have closed, or that it is incomplete. Nothing for one that is settled,
 * and nothing for one with no activity.
 *
 * "Incomplete" is a month that is over with days that were never closed
 * (ANALYTICS-03); the count is of the days since the Property had a unit, so a
 * month that began before it opened is not blamed for days that never existed.
 */
export function PeriodStatus({
  locale,
  report,
  windowed = false,
}: {
  locale: SupportedLocale;
  report: PeriodReport;
  /** A trailing window, which is not "month to date". */
  windowed?: boolean;
}) {
  const t = useTranslations("analytics.month");
  const counted = formatNumber(report.daysCounted, locale);

  if (report.state === "in_progress") {
    const days = {
      closed: formatNumber(report.daysClosed, locale),
      total: counted,
    };
    return (
      <StatusBadge
        className="w-fit"
        icon={CalendarClock}
        label={windowed ? t("closedOf", days) : t("monthToDate", days)}
        tone="info"
      />
    );
  }
  if (report.state === "incomplete") {
    return (
      <StatusBadge
        className="w-fit"
        icon={TriangleAlert}
        label={t("incompleteBadge", {
          unclosed: formatNumber(
            report.daysCounted - report.daysClosed,
            locale,
          ),
          total: counted,
        })}
        tone="warning"
      />
    );
  }
  return null;
}

/**
 * What the figures above rest on, in words: which days each kind of figure
 * counts, how many days wait for the front desk to close them and where that
 * is done (ANALYTICS-04), and the day the figures are as of.
 *
 * What is said about revenue is said only to somebody who is shown revenue
 * (ANALYTICS-08): a reader who sees none is not told what it covers.
 */
export function PeriodNotes({
  locale,
  propertyId,
  report,
}: {
  locale: SupportedLocale;
  propertyId: string;
  report: PeriodReport;
}) {
  const t = useTranslations("analytics.month");
  if (report.state === "no_activity") return null;

  const money = report.mayReadMoney;
  const note =
    report.state === "in_progress"
      ? money
        ? t("openNote")
        : t("openNoteNoMoney")
      : report.state === "incomplete"
        ? money
          ? t("incompleteNote")
          : t("incompleteNoteNoMoney")
        : null;
  const waiting = report.state === "in_progress" && report.daysWaiting > 0;

  return (
    <div className="grid max-w-prose gap-2 text-sm text-muted-foreground">
      {note ? <p>{note}</p> : null}
      {waiting ? (
        <p data-testid="days-waiting">
          {t("waiting", { count: report.daysWaiting })}{" "}
          {report.mayReadMoney && report.daysClosed === 0
            ? t("noFiguresYet")
            : null}{" "}
          {report.mayCloseDay ? (
            <Link
              className="font-medium text-primary underline"
              href={`${localizeHref(locale, "close-day")}?property=${propertyId}`}
              prefetch={false}
            >
              {t("closeDayLink")}
            </Link>
          ) : (
            t("closeDayWho")
          )}
        </p>
      ) : null}
      <p>{t("asOf", { date: formatLongDate(report.today, locale) })}</p>
    </div>
  );
}
