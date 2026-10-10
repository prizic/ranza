"use client";

import Link from "next/link";
import { ArrowRight, Receipt } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import type {
  ChargesCard as Charges,
  Section,
} from "../../../server/today-derive";
import { money } from "../format";
import { todayHref } from "../links";
import { SectionUnavailable } from "./section-unavailable";

/**
 * What the day has put on Guests' accounts so far: charges less the reversals
 * of charges, as one figure that opens Finance (TD-S3-02). Payments are not
 * charges and are in neither half; the word is charges, never revenue — a
 * revenue figure is its own slice (TD-DEF-05).
 */
export function ChargesCard({
  charges,
  currency,
  locale,
  onRetry,
  propertyId,
}: {
  charges: Section<Charges>;
  currency: string;
  locale: SupportedLocale;
  onRetry: () => void;
  propertyId: string;
}) {
  const t = useTranslations("dashboard");

  return (
    <section
      aria-labelledby="today-charges"
      className={cn(
        "rounded-[2rem] border border-slate-100 bg-card p-5 md:p-6",
        charges.status === "ok" && charges.stale && "opacity-70",
      )}
    >
      <h2 className="mb-3 text-base font-semibold" id="today-charges">
        {t("chargesTitle")}
      </h2>
      {charges.status === "unavailable" ? (
        <SectionUnavailable onRetry={onRetry} />
      ) : (
        <Link
          className="group flex items-start justify-between gap-3 rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          href={todayHref(locale, "finance", propertyId)}
          prefetch={false}
        >
          <span>
            <span className="block text-3xl leading-none font-light tracking-tight tabular-nums">
              {money(charges.data.net, currency, locale)}
            </span>
            <span className="mt-2 block text-xs text-muted-foreground">
              {t("chargesNote")}
            </span>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
            <Receipt aria-hidden="true" className="size-4" />
            {t("openFinance")}
            <ArrowRight aria-hidden="true" className="size-3 rtl:rotate-180" />
          </span>
        </Link>
      )}
    </section>
  );
}
