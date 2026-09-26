"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import type {
  MaintenanceCard as Maintenance,
  Section,
} from "../../../server/today-derive";
import { todayHref } from "../links";
import { SectionUnavailable } from "./section-unavailable";

/**
 * Open maintenance at a glance, for the manager (TD-S4-04). Out of order
 * counts Units, beds included, however many requests hold each; the board it
 * opens still counts holding requests (MT-S2-32). Every figure
 * opens the maintenance board at the Property; the board has no filter to
 * open at yet (TD-DEF-09).
 */
export function MaintenanceCard({
  locale,
  maintenance,
  onRetry,
  propertyId,
}: {
  locale: SupportedLocale;
  maintenance: Section<Maintenance>;
  onRetry: () => void;
  propertyId: string;
}) {
  const t = useTranslations("dashboard");
  const href = todayHref(locale, "maintenance", propertyId);

  return (
    <section
      aria-labelledby="today-maintenance"
      className={cn(
        "rounded-[2rem] border border-slate-100 bg-card p-5 md:p-6",
        maintenance.status === "ok" && maintenance.stale && "opacity-70",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold" id="today-maintenance">
          {t("maintenanceTitle")}
        </h2>
        <Link
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          href={href}
        >
          {t("openMaintenance")}
          <ArrowRight aria-hidden="true" className="size-3 rtl:rotate-180" />
        </Link>
      </div>
      {maintenance.status === "unavailable" ? (
        <SectionUnavailable onRetry={onRetry} />
      ) : (
        <Figures data={maintenance.data} href={href} locale={locale} />
      )}
    </section>
  );
}

function Figures({
  data,
  href,
  locale,
}: {
  data: Maintenance;
  href: string;
  locale: SupportedLocale;
}) {
  const t = useTranslations("dashboard");
  const rows = [
    { key: "statusNew", count: data.new, swatch: "bg-info" },
    { key: "statusInProgress", count: data.inProgress, swatch: "bg-primary" },
    {
      key: "statusWaitingForParts",
      count: data.waitingForParts,
      swatch: "bg-warning",
    },
  ] as const;

  return (
    <>
      <p className="text-sm text-muted-foreground">{t("openRequests")}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {formatNumber(data.open, locale)}
      </p>
      <ul className="mt-4 grid gap-2">
        {rows.map((row) => (
          <Figure
            count={row.count}
            href={href}
            key={row.key}
            label={t(row.key)}
            locale={locale}
            swatch={row.swatch}
          />
        ))}
      </ul>
      <ul className="mt-4 grid gap-2 border-t border-border pt-4">
        <Figure
          count={data.outOfOrder}
          href={href}
          label={t("roomsOutOfOrder")}
          locale={locale}
          swatch="bg-border"
        />
      </ul>
    </>
  );
}

function Figure({
  count,
  href,
  label,
  locale,
  swatch,
}: {
  count: number;
  href: string;
  label: string;
  locale: SupportedLocale;
  swatch: string;
}) {
  return (
    <li>
      <Link
        className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-0.5 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href={href}
        prefetch={false}
      >
        <span aria-hidden="true" className={cn("size-3 rounded", swatch)} />
        <span className="flex-1">{label}</span>
        <span className="font-semibold tabular-nums">
          {formatNumber(count, locale)}
        </span>
      </Link>
    </li>
  );
}
