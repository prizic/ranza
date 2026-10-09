"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import type { PortfolioProperty } from "../../../server/portfolio";
import { occupancyPercent } from "../derive";
import {
  formatBalance,
  formatBusinessDate,
  formatCount,
  formatShare,
} from "../format";
import { OpenProperty } from "./open-property";

/**
 * One Property, with the figures that let it be set beside the others.
 *
 * A null is never a zero. A Property whose analytics are off is withheld
 * whole and says so; a figure whose module is off there is "not available";
 * and money the viewer's role keeps from them is "hidden" with a lock, a
 * different thing from either (PF-S1-10 to PF-S1-12). Occupancy is the counts,
 * with the share worked out from them, and a dash where nothing is sellable.
 */
export function PropertyCard({
  locale,
  property,
}: {
  locale: SupportedLocale;
  property: PortfolioProperty;
}) {
  const t = useTranslations("portfolio");
  const {
    currency,
    entitled,
    openFolioBalanceMinor,
    propertyId,
    propertyName,
  } = property;

  const count = (value: number | null) =>
    value === null ? (
      <span className="font-normal text-muted-foreground">
        {t("unavailable")}
      </span>
    ) : (
      formatCount(value, locale)
    );

  return (
    <li
      aria-labelledby={`portfolio-${propertyId}`}
      className="flex flex-col gap-5 rounded-[2rem] border border-slate-100 bg-card p-6"
      data-property-id={propertyId}
    >
      <header>
        <h2
          className="text-lg font-medium tracking-tight"
          id={`portfolio-${propertyId}`}
        >
          {propertyName}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("businessDate", {
            date: formatBusinessDate(property.businessDate, locale),
          })}{" "}
          <span aria-hidden="true">·</span> {currency}
        </p>
      </header>

      {entitled ? (
        <>
          <Occupancy locale={locale} property={property} />
          <dl className="grid gap-2.5 text-sm">
            <Row label={t("arrivals")}>{count(property.arrivalsToCome)}</Row>
            <Row label={t("departures")}>
              {count(property.departuresToCome)}
            </Row>
            <Row label={t("maintenance")}>
              {count(property.openMaintenanceRequests)}
            </Row>
            <Row label={t("moneyOwed")}>
              {openFolioBalanceMinor === null ? (
                <span className="inline-flex items-center gap-1.5 font-normal text-muted-foreground">
                  <Lock aria-hidden="true" className="size-3.5" />
                  {t("hidden")}
                </span>
              ) : (
                formatBalance(openFolioBalanceMinor, currency, locale)
              )}
            </Row>
          </dl>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("withheld")}</p>
      )}

      <div className="mt-auto pt-1">
        <OpenProperty
          label={t("open", { property: propertyName })}
          locale={locale}
          propertyId={propertyId}
        />
      </div>
    </li>
  );
}

function Row({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function Occupancy({
  locale,
  property,
}: {
  locale: SupportedLocale;
  property: PortfolioProperty;
}) {
  const t = useTranslations("portfolio");
  const { occupiedUnits, sellableUnits } = property;

  if (occupiedUnits === null || sellableUnits === null) {
    return (
      <div>
        <p className="text-4xl leading-none font-light text-muted-foreground">
          —
        </p>
        <p className="mt-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("cardOccupancy")} · {t("unavailable")}
        </p>
      </div>
    );
  }

  const share = occupancyPercent(occupiedUnits, sellableUnits);
  return (
    <div>
      <p className="text-4xl leading-none font-light tracking-tight tabular-nums">
        {formatCount(occupiedUnits, locale)}
        <span className="text-xl text-muted-foreground">
          {" "}
          / {formatCount(sellableUnits, locale)}
        </span>
      </p>
      <p className="mt-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("cardOccupancy")}
        {share === null ? null : ` · ${formatShare(share, locale)}`}
      </p>
      {share === null ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {t("noSellableUnits")}
        </p>
      ) : (
        <div
          aria-label={t("cardOccupancy")}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(share)}
          className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
        >
          <span
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, share)}%` }}
          />
        </div>
      )}
    </div>
  );
}
