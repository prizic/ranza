"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatMoney, formatNumber, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import type {
  OverdueInstalmentsCard,
  Section,
} from "../../../server/today-derive";
import { Panel } from "../layouts/parts";
import { todayHref } from "../links";
import { SectionUnavailable } from "./section-unavailable";

/**
 * Residents with an instalment past its date, as the payment plans' one
 * definition of overdue counts them. The big figure is the Residents and it
 * opens exactly those rows in Finance; the money beside it is what is overdue,
 * never what is owed in all. It reaches only a viewer who may see money, and a
 * read that failed is said, never drawn as nobody.
 */
export function OverdueCard({
  locale,
  onRetry,
  overdue,
  propertyId,
}: {
  locale: SupportedLocale;
  onRetry: () => void;
  overdue: Section<OverdueInstalmentsCard>;
  propertyId: string;
}) {
  const t = useTranslations("dashboard");
  if (overdue.status === "unavailable") {
    return <SectionUnavailable onRetry={onRetry} />;
  }
  const { students, instalments, overdueMinor, currency } = overdue.data;
  const amount = formatMoney(overdueMinor, currency, locale);

  return (
    <Panel
      className={cn(overdue.stale && "opacity-70")}
      labelledBy="overdue-title"
    >
      <h2 className="text-xl font-semibold tracking-tight" id="overdue-title">
        {t("overdueTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("overdueHint")}</p>
      <Link
        aria-label={t("overdueLink", { count: students, amount })}
        className="mt-5 flex flex-col gap-1 rounded-2xl border border-border p-4 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href={todayHref(locale, "finance", propertyId, { show: "overdue" })}
        prefetch={false}
      >
        <span className="text-5xl font-light tracking-tight text-danger tabular-nums">
          {formatNumber(students, locale)}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("overdueResidents", { count: students })}
        </span>
        <span className="text-sm font-medium tabular-nums">
          {t("overdueSummary", { instalments, amount })}
        </span>
      </Link>
    </Panel>
  );
}
