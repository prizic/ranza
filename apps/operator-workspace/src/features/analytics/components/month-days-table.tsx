"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@ranza/ui";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import type { DayRow, Figures } from "../../../server/analytics";
import { analyticsHref } from "../href";
import {
  formatDayOfMonth,
  formatMinorMoney,
  formatPercentValue,
  formatShortDate,
  formatWeekdayShort,
} from "../format";
import { MonthSection } from "./month-section";

const NUMERIC = "px-2 text-end tabular-nums sm:px-3";
const HEAD = "h-auto py-2 align-bottom whitespace-normal";

function DayLabel({ date, locale }: { date: string; locale: SupportedLocale }) {
  return (
    <>
      <span className="inline-block w-7 font-medium tabular-nums">
        {formatDayOfMonth(date, locale)}
      </span>{" "}
      <span className="text-muted-foreground">
        {formatWeekdayShort(date, locale)}
      </span>
    </>
  );
}

/**
 * Every day of the period, quiet ones included (AN-S2-14). The day not yet
 * closed is marked and says its nights are not charged; a day before the
 * Property had a unit says so, and carries no figure; days to come are muted
 * and carry no figure, because a night that has not happened is not a zero.
 * The foot is the totals of the figures above, so the column can be summed by
 * hand.
 *
 * Every day that has happened is a row that opens it (AN-S3-04), by the link in
 * its date for a keyboard and a screen reader and by the row for a hand; a day
 * to come has nothing to open. Below `md` the table is a long list of cards, so
 * it opens behind a button: the three headline figures are what a phone is
 * asked for, and the days are one press away (ANALYTICS-14).
 */
export function MonthDaysTable({
  currency,
  days,
  figures,
  locale,
  mayReadMoney,
}: {
  currency: string;
  days: readonly DayRow[];
  figures: Figures;
  locale: SupportedLocale;
  mayReadMoney: boolean;
}) {
  const t = useTranslations("analytics.month");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [shown, setShown] = useState(false);

  const nights = (day: DayRow) =>
    day.state === "future" || day.beforeOpening
      ? "—"
      : formatNumber(day.occupiedNights, locale);
  const occupancy = (percent: number | null) =>
    percent === null ? "—" : formatPercentValue(percent, locale);
  const revenue = (day: DayRow) => {
    if (day.beforeOpening) return "—";
    if (day.state === "open") return t("notYetCharged");
    return day.roomRevenueMinor === null
      ? "—"
      : formatMinorMoney(day.roomRevenueMinor, currency, locale);
  };
  const hrefOf = (day: DayRow) =>
    analyticsHref(pathname, searchParams, {
      month: day.date.slice(0, 7),
      day: day.date,
    });

  return (
    <MonthSection title={t("days")}>
      <Button
        aria-controls="analytics-days"
        aria-expanded={shown}
        className="mb-2 md:hidden"
        onClick={() => setShown((open) => !open)}
        type="button"
        variant="outline"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 transition-transform", shown && "rotate-180")}
        />
        {shown
          ? t("hideDays")
          : t("showDays", { count: formatNumber(days.length, locale) })}
      </Button>
      <div
        className={cn(shown ? "block" : "hidden", "md:block")}
        id="analytics-days"
      >
        <Table className="text-xs sm:text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(HEAD, "ps-0")}>{t("dayCol")}</TableHead>
              <TableHead className={cn(HEAD, NUMERIC)}>
                {t("occupiedCol")}
              </TableHead>
              <TableHead className={cn(HEAD, NUMERIC)}>
                {t("occupancyCol")}
              </TableHead>
              {mayReadMoney ? (
                <TableHead className={cn(HEAD, NUMERIC)}>
                  {t("revenueCol")}
                </TableHead>
              ) : null}
              <TableHead className="w-6 px-0">
                <span className="sr-only">{t("dayCol")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((day) => (
              <TableRow
                className={cn(
                  day.state === "open" &&
                    !day.beforeOpening &&
                    "bg-secondary hover:bg-secondary",
                  (day.state === "future" || day.beforeOpening) &&
                    "text-muted-foreground/60",
                  day.state !== "future" && "cursor-pointer hover:bg-muted/50",
                )}
                data-date={day.date}
                data-day-state={day.state}
                key={day.date}
                {...(day.state === "future"
                  ? {}
                  : {
                      onClick: (event: React.MouseEvent) => {
                        // The link in the date is its own way in.
                        if ((event.target as HTMLElement).closest("a")) return;
                        router.push(hrefOf(day), { scroll: false });
                      },
                    })}
              >
                <TableCell className="ps-0">
                  {day.state === "future" ? (
                    <DayLabel date={day.date} locale={locale} />
                  ) : (
                    <Link
                      className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-day-link
                      href={hrefOf(day)}
                      prefetch={false}
                      scroll={false}
                    >
                      <DayLabel date={day.date} locale={locale} />{" "}
                      <span className="sr-only">
                        {t("showDay", {
                          date: formatShortDate(day.date, locale),
                        })}
                      </span>
                    </Link>
                  )}
                  {day.beforeOpening ? (
                    <span className="block text-xs sm:ms-3 sm:inline">
                      {t("beforeOpening")}
                    </span>
                  ) : day.state === "open" ? (
                    <span className="block text-xs font-medium text-primary sm:ms-3 sm:inline">
                      {t("openDay")}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className={NUMERIC}>{nights(day)}</TableCell>
                <TableCell className={NUMERIC}>
                  {occupancy(day.occupancyPercent)}
                </TableCell>
                {mayReadMoney ? (
                  <TableCell
                    className={cn(
                      NUMERIC,
                      day.state === "open" &&
                        !day.beforeOpening &&
                        "text-xs whitespace-normal text-muted-foreground",
                    )}
                  >
                    {revenue(day)}
                  </TableCell>
                ) : null}
                <TableCell className="w-6 px-0 text-muted-foreground">
                  {day.state === "future" ? null : (
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 rtl:rotate-180"
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="ps-0 whitespace-normal">
                {t("monthTotal")}
              </TableCell>
              <TableCell className={NUMERIC}>
                {formatNumber(figures.occupiedNights, locale)}
              </TableCell>
              <TableCell className={NUMERIC}>
                {occupancy(figures.occupancyPercent)}
              </TableCell>
              {mayReadMoney ? (
                <TableCell className={NUMERIC}>
                  {formatMinorMoney(
                    figures.roomRevenueUnknown
                      ? null
                      : (figures.roomRevenue?.netMinor ?? null),
                    currency,
                    locale,
                  )}
                </TableCell>
              ) : null}
              <TableCell className="w-6 px-0" />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </MonthSection>
  );
}
