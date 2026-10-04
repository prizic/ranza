"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@ranza/ui";
import type { AnalyticsRange } from "../../../server/analytics";
import { analyticsHref } from "../href";

const WINDOWS = [
  { key: "month", labelKey: "rangeMonth" },
  { key: "today", labelKey: "rangeToday" },
  { key: "7d", labelKey: "range7d" },
  { key: "30d", labelKey: "range30d" },
] as const;

/**
 * The month, and the trailing windows beside it. The month is the screen's
 * default; today, 7 days and 30 days stay as the second way to look (AN-S2-19).
 */
export function RangeSelector({
  current,
}: {
  current: AnalyticsRange | "month";
}) {
  const t = useTranslations("analytics");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <nav
      aria-label={t("rangeSelectorLabel")}
      className="inline-flex flex-wrap items-center gap-1 rounded-full bg-muted p-1"
    >
      {WINDOWS.map(({ key, labelKey }) => {
        const isActive = current === key;
        return (
          <Link
            key={key}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-sm",
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            href={analyticsHref(
              pathname,
              searchParams,
              key === "month" ? {} : { range: key },
            )}
            prefetch={false}
          >
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
