"use client";

import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import type { Figures } from "../../../server/analytics";
import { MonthSection } from "./month-section";

/**
 * The nights behind the rates, split by who slept them. Residents are billed
 * monthly and not by the night, so a Property of Residents reads low on
 * revenue and the page says why (AN-S2-23) — but only where revenue is shown.
 */
export function NightsSection({
  figures,
  locale,
  mayReadMoney,
}: {
  figures: Figures;
  locale: SupportedLocale;
  mayReadMoney: boolean;
}) {
  const t = useTranslations("analytics.month");
  const items = [
    { label: t("availableNights"), value: figures.availableNights },
    { label: t("occupiedNights"), value: figures.occupiedNights },
    { label: t("guestNights"), value: figures.guestNights },
    { label: t("residentNights"), value: figures.residentNights },
  ];

  return (
    <MonthSection title={t("nights")}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
        {items.map(({ label, value }) => (
          <div data-row key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-3xl leading-none font-light tabular-nums">
              {formatNumber(value, locale)}
            </dd>
          </div>
        ))}
      </dl>
      {mayReadMoney && figures.residentNights > 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          {t("residentNote")}
        </p>
      ) : null}
    </MonthSection>
  );
}
