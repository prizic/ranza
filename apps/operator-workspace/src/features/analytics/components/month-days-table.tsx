"use client";

import { useTranslations } from "next-intl";
import {
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
import {
  formatDayOfMonth,
  formatMinorMoney,
  formatPercentValue,
  formatWeekdayShort,
} from "../format";
import { MonthSection } from "./month-section";

const NUMERIC = "px-2 text-end tabular-nums sm:px-3";
const HEAD = "h-auto py-2 align-bottom whitespace-normal";

/**
 * Every day of the month, quiet ones included (AN-S2-14). The day not yet
 * closed is marked and says its nights are not charged; days to come are muted
 * and carry no figure, because a night that has not happened is not a zero.
 * The foot is the closed days' total, so the column can be summed by hand.
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

  const nights = (day: DayRow) =>
    day.state === "future" ? "—" : formatNumber(day.occupiedNights, locale);
  const occupancy = (percent: number | null) =>
    percent === null ? "—" : formatPercentValue(percent, locale);
  const revenue = (day: DayRow) => {
    if (day.state === "open") return t("notYetCharged");
    return day.roomRevenueMinor === null
      ? "—"
      : formatMinorMoney(day.roomRevenueMinor, currency, locale);
  };

  return (
    <MonthSection title={t("days")}>
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
              <TableHead className={cn(HEAD, NUMERIC, "pe-0 sm:pe-0")}>
                {t("revenueCol")}
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((day) => (
            <TableRow
              className={cn(
                day.state === "open" && "bg-secondary hover:bg-secondary",
                day.state === "future" && "text-muted-foreground/60",
              )}
              data-date={day.date}
              data-day-state={day.state}
              key={day.date}
            >
              <TableCell className="ps-0">
                <span className="inline-block w-7 font-medium tabular-nums">
                  {formatDayOfMonth(day.date, locale)}
                </span>
                <span className="text-muted-foreground">
                  {formatWeekdayShort(day.date, locale)}
                </span>
                {day.state === "open" ? (
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
                    "pe-0 sm:pe-0",
                    day.state === "open" &&
                      "text-xs whitespace-normal text-muted-foreground",
                  )}
                >
                  {revenue(day)}
                </TableCell>
              ) : null}
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
              <TableCell className={cn(NUMERIC, "pe-0 sm:pe-0")}>
                {formatMinorMoney(
                  figures.roomRevenue?.netMinor ?? null,
                  currency,
                  locale,
                )}
              </TableCell>
            ) : null}
          </TableRow>
        </TableFooter>
      </Table>
    </MonthSection>
  );
}
