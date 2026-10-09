"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState, PageHeader } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import type { Portfolio } from "../../../server/portfolio";
import { summarize } from "../derive";
import { OpenProperty } from "./open-property";
import { PropertyCard } from "./property-card";
import { SummaryStats } from "./summary-stats";
import { TodayLink } from "./today-link";

/**
 * All Properties: what an Owner needs to set one Property beside another
 * without switching between them.
 *
 * Presentational — the route reads the portfolio and hands it over. The
 * states it has to tell apart are no Property at all, one (nothing to compare,
 * and a way to Today), and many; money the viewer may not see is shown as
 * hidden and never as zero.
 */
export function PortfolioView({
  asOf,
  data,
  locale,
  organizationName,
}: {
  /** When the figures were read, already written in the viewer's language. */
  asOf: string;
  data: Portfolio;
  locale: SupportedLocale;
  organizationName: string;
}) {
  const t = useTranslations("portfolio");
  const { properties } = data;

  const [only] = properties;
  if (!only) {
    return (
      <EmptyState
        action={<TodayLink label={t("goToToday")} locale={locale} />}
        description={t("noneDescription")}
        title={t("noneTitle")}
      />
    );
  }
  if (properties.length === 1) {
    return (
      <EmptyState
        action={
          <OpenProperty
            label={t("goToToday")}
            locale={locale}
            propertyId={only.propertyId}
            variant="default"
          />
        }
        description={t("oneDescription", { property: only.propertyName })}
        title={t("oneTitle")}
      />
    );
  }

  const summary = summarize(data);
  return (
    <div className="grid gap-6">
      <PageHeader
        aside={<p className="text-sm text-muted-foreground">{asOf}</p>}
      >
        <p className="text-muted-foreground">
          {t("subtitle", { organization: organizationName })}
        </p>
      </PageHeader>

      {summary.moneyHidden ? (
        <div
          className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/80 p-3.5 text-sm text-amber-800"
          role="status"
        >
          <ShieldAlert aria-hidden="true" className="size-4 shrink-0" />
          <span>{t("moneyHiddenNotice")}</span>
        </div>
      ) : null}

      <SummaryStats locale={locale} summary={summary} />

      <ul
        aria-label={t("listLabel")}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {properties.map((property) => (
          <PropertyCard
            key={property.propertyId}
            locale={locale}
            property={property}
          />
        ))}
      </ul>
    </div>
  );
}
