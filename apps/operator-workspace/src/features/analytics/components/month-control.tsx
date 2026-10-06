"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { analyticsHref } from "../href";
import { formatMonthTitle } from "../format";

/**
 * Previous and next month, as the report names them. A month the report does
 * not name — before the first activity, after the current month — is a
 * disabled button and not a link that would only bounce back (AN-S2-02).
 */
export function MonthControl({
  locale,
  nextMonth,
  previousMonth,
}: {
  locale: SupportedLocale;
  nextMonth: string | null;
  previousMonth: string | null;
}) {
  const t = useTranslations("analytics.month");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const step = (Icon: LucideIcon, name: string, month: string | null) => {
    const icon = <Icon aria-hidden="true" className="size-4 rtl:rotate-180" />;
    if (month === null) {
      return (
        <Button
          aria-label={name}
          className="rounded-full"
          disabled
          size="icon"
          type="button"
          variant="outline"
        >
          {icon}
        </Button>
      );
    }
    return (
      <Button asChild className="rounded-full" size="icon" variant="outline">
        <Link
          aria-label={`${name}: ${formatMonthTitle(month, locale)}`}
          href={analyticsHref(pathname, searchParams, { month })}
          prefetch={false}
        >
          {icon}
        </Link>
      </Button>
    );
  };

  return (
    <nav aria-label={t("navigation")} className="flex items-center gap-2">
      {step(ChevronLeft, t("previousMonth"), previousMonth)}
      {step(ChevronRight, t("nextMonth"), nextMonth)}
    </nav>
  );
}
