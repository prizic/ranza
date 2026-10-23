"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import type { PortfolioProperty } from "../../../server/portfolio";
import { occupancyPercent } from "../derive";
import { formatBalance, formatCount, formatShare } from "../format";
import { OpenProperty } from "./open-property";
import { PropertyLink } from "./property-link";

/**
 * Every Property on one line, for an Organization with more of them than cards
 * fit on a screen (PORTFOLIO-06). The same figures, the same nulls, the same
 * links as a card: only the shape differs.
 */
export function PropertyTable({
  locale,
  properties,
}: {
  locale: SupportedLocale;
  properties: readonly PortfolioProperty[];
}) {
  const t = useTranslations("portfolio");

  const count = (
    property: PortfolioProperty,
    label: string,
    value: number | null,
    segment: string,
  ) =>
    value === null ? (
      <span className="font-normal text-muted-foreground">
        {t("unavailable")}
      </span>
    ) : (
      <PropertyLink
        className="underline-offset-4 hover:underline"
        label={t("openList", { label, property: property.propertyName })}
        locale={locale}
        propertyId={property.propertyId}
        segment={segment}
      >
        {formatCount(value, locale)}
      </PropertyLink>
    );

  return (
    <Table aria-label={t("listLabel")}>
      <TableHeader>
        <TableRow>
          <TableHead>{t("colProperty")}</TableHead>
          <TableHead className="text-end">{t("cardOccupancy")}</TableHead>
          <TableHead className="text-end">{t("arrivals")}</TableHead>
          <TableHead className="text-end">{t("departures")}</TableHead>
          <TableHead className="text-end">{t("maintenance")}</TableHead>
          <TableHead className="text-end">{t("moneyOwed")}</TableHead>
          <TableHead>
            <span className="sr-only">{t("colProperty")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {properties.map((property) => {
          const share =
            property.occupiedUnits === null || property.sellableUnits === null
              ? null
              : occupancyPercent(
                  property.occupiedUnits,
                  property.sellableUnits,
                );
          return (
            <TableRow
              data-property-id={property.propertyId}
              key={property.propertyId}
            >
              <TableCell className="font-medium">
                {property.propertyName}
              </TableCell>
              {property.entitled ? (
                <>
                  <TableCell className="text-end tabular-nums">
                    {property.occupiedUnits === null ? (
                      <span className="font-normal text-muted-foreground">
                        {t("unavailable")}
                      </span>
                    ) : (
                      <>
                        {share === null ? "—" : formatShare(share, locale)}
                        <span className="block text-xs text-muted-foreground">
                          {t("unitsInUse", {
                            occupied: formatCount(
                              property.occupiedUnits,
                              locale,
                            ),
                            sellable: formatCount(
                              property.sellableUnits ?? 0,
                              locale,
                            ),
                          })}
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {count(
                      property,
                      t("arrivals"),
                      property.arrivalsToCome,
                      "arrivals",
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {count(
                      property,
                      t("departures"),
                      property.departuresToCome,
                      "departures",
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {count(
                      property,
                      t("maintenance"),
                      property.openMaintenanceRequests,
                      "maintenance",
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {property.openFolioBalanceMinor === null ? (
                      <span className="inline-flex items-center gap-1.5 font-normal text-muted-foreground">
                        <Lock aria-hidden="true" className="size-3.5" />
                        {t("hidden")}
                      </span>
                    ) : (
                      <PropertyLink
                        className="underline-offset-4 hover:underline"
                        label={t("openList", {
                          label: t("moneyOwed"),
                          property: property.propertyName,
                        })}
                        locale={locale}
                        propertyId={property.propertyId}
                        query="show=owing"
                        segment="finance"
                      >
                        {formatBalance(
                          property.openFolioBalanceMinor,
                          property.currency,
                          locale,
                        )}
                      </PropertyLink>
                    )}
                  </TableCell>
                </>
              ) : (
                <TableCell className="text-muted-foreground" colSpan={5}>
                  {t("withheld")}
                </TableCell>
              )}
              <TableCell className="text-end">
                <OpenProperty
                  label={t("open", { property: property.propertyName })}
                  locale={locale}
                  propertyId={property.propertyId}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
