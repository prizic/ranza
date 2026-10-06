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
import type { Figures, UnitTypeRow } from "../../../server/analytics";
import { formatMinorMoney, formatPercentValue } from "../format";
import { MonthSection } from "./month-section";

const NUMERIC = "px-2 text-end tabular-nums sm:px-3";
const HEAD = "h-auto py-2 align-bottom whitespace-normal";
// Money gets its own columns from `sm` up. Below it the figures are stacked
// under the name instead, because two money columns do not fit a phone and a
// table that scrolls sideways hides the very figures it is for.
const MONEY_COLUMN = "hidden sm:table-cell";

/**
 * The month by unit type: one row for each type the Property has, whose nights
 * and revenue add up to the headline, with the foot saying so by being the
 * headline (AN-S3-02). A viewer who may not read money gets the nights and the
 * occupancy and no money columns at all.
 */
export function UnitTypeSection({
  currency,
  figures,
  locale,
  mayReadMoney,
  rows,
}: {
  currency: string;
  figures: Figures;
  locale: SupportedLocale;
  mayReadMoney: boolean;
  rows: readonly UnitTypeRow[];
}) {
  const t = useTranslations("analytics.month");
  const root = useTranslations();
  const occupancy = (percent: number | null) =>
    percent === null ? "—" : formatPercentValue(percent, locale);
  const money = (minor: number | null) =>
    formatMinorMoney(minor, currency, locale);
  const stacked = (revenue: number | null, adr: number | null) =>
    mayReadMoney ? (
      <span className="mt-0.5 block text-xs font-normal whitespace-normal text-muted-foreground sm:hidden">
        <span className="block">
          {t("revenueCol")}: <bdi>{money(revenue)}</bdi>
        </span>
        <span className="block">
          {t("adrCol")}: <bdi>{money(adr)}</bdi>
        </span>
      </span>
    ) : null;

  return (
    <MonthSection title={t("unitTypes")}>
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        {t("unitTypeNote")}
      </p>
      <Table className="text-xs sm:text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(HEAD, "ps-0")}>
              {t("unitTypeCol")}
            </TableHead>
            <TableHead className={cn(HEAD, NUMERIC)}>
              {t("availableNights")}
            </TableHead>
            <TableHead className={cn(HEAD, NUMERIC)}>
              {t("occupiedNights")}
            </TableHead>
            <TableHead className={cn(HEAD, NUMERIC)}>
              {t("occupancyCol")}
            </TableHead>
            {mayReadMoney ? (
              <>
                <TableHead className={cn(HEAD, NUMERIC, MONEY_COLUMN)}>
                  {t("revenueCol")}
                </TableHead>
                <TableHead
                  className={cn(HEAD, NUMERIC, MONEY_COLUMN, "pe-0 sm:pe-0")}
                >
                  {t("adrCol")}
                </TableHead>
              </>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow data-unit-type={row.unitType} key={row.unitType}>
              <TableCell className="ps-0 font-medium">
                {root(`unitType.${row.unitType}`)}
                {stacked(row.roomRevenueMinor, row.adrMinor)}
              </TableCell>
              <TableCell className={NUMERIC}>
                {formatNumber(row.availableNights, locale)}
              </TableCell>
              <TableCell className={NUMERIC}>
                {formatNumber(row.occupiedNights, locale)}
              </TableCell>
              <TableCell className={NUMERIC}>
                {occupancy(row.occupancyPercent)}
              </TableCell>
              {mayReadMoney ? (
                <>
                  <TableCell className={cn(NUMERIC, MONEY_COLUMN)}>
                    {money(row.roomRevenueMinor)}
                  </TableCell>
                  <TableCell
                    className={cn(NUMERIC, MONEY_COLUMN, "pe-0 sm:pe-0")}
                  >
                    {money(row.adrMinor)}
                  </TableCell>
                </>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell className="ps-0 whitespace-normal">
              {t("monthTotal")}
              {stacked(figures.roomRevenue?.netMinor ?? null, figures.adrMinor)}
            </TableCell>
            <TableCell className={NUMERIC}>
              {formatNumber(figures.availableNights, locale)}
            </TableCell>
            <TableCell className={NUMERIC}>
              {formatNumber(figures.occupiedNights, locale)}
            </TableCell>
            <TableCell className={NUMERIC}>
              {occupancy(figures.occupancyPercent)}
            </TableCell>
            {mayReadMoney ? (
              <>
                <TableCell className={cn(NUMERIC, MONEY_COLUMN)}>
                  {money(figures.roomRevenue?.netMinor ?? null)}
                </TableCell>
                <TableCell
                  className={cn(NUMERIC, MONEY_COLUMN, "pe-0 sm:pe-0")}
                >
                  {money(figures.adrMinor)}
                </TableCell>
              </>
            ) : null}
          </TableRow>
        </TableFooter>
      </Table>
    </MonthSection>
  );
}
