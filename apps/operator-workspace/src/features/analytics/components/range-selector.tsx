"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@ranza/ui";
import type { AnalyticsRange } from "../../../server/analytics";

interface RangeSelectorProps {
  currentRange: AnalyticsRange;
}

const RANGES = [
  { key: "today", labelKey: "rangeToday" },
  { key: "7d", labelKey: "range7d" },
  { key: "30d", labelKey: "range30d" },
  { key: "mtd", labelKey: "rangeMtd" },
] as const;

export function RangeSelector({ currentRange }: RangeSelectorProps) {
  const t = useTranslations("analytics");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (range: AnalyticsRange) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    return `${pathname}?${params.toString()}`;
  };

  return (
    <nav
      aria-label={t("rangeSelectorLabel")}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900/60"
    >
      {RANGES.map(({ key, labelKey }) => {
        const isActive = currentRange === key;
        return (
          <Link
            key={key}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 sm:text-sm",
              isActive
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200",
            )}
            href={hrefFor(key)}
          >
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
