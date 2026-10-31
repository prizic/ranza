"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import type { EmptyBedsCard as EmptyBeds } from "../../../server/today-derive";
import { Panel } from "../layouts/parts";
import { FREE_FILTER_KEY } from "./list-filter-notice";
import { todayHref } from "../links";
import { ADMITS_FILTERS } from "../views";

/**
 * How many beds can still be given tonight to a woman, a man, or anybody
 * (RB-S5-20): a dormitory manager's first question of the day. Each figure
 * opens Rooms narrowed to the free places it counts, which say so and give the
 * same number back.
 */
export function EmptyBedsCard({
  data,
  locale,
  propertyId,
}: {
  data: EmptyBeds;
  locale: SupportedLocale;
  propertyId: string;
}) {
  const t = useTranslations("dashboard");
  const admits = useTranslations("roomAdmits");
  return (
    <Panel labelledBy="empty-beds-title">
      <h2
        className="text-xl font-semibold tracking-tight"
        id="empty-beds-title"
      >
        {t("emptyBedsTitle", { unit: data.byBed ? "bed" : "room" })}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("emptyBedsHint")}</p>
      <ul className="mt-5 grid grid-cols-3 gap-2">
        {ADMITS_FILTERS.map((filter) => (
          <li key={filter}>
            <Link
              aria-label={t(FREE_FILTER_KEY[filter], { count: data[filter] })}
              className="flex h-full flex-col gap-1 rounded-2xl border border-border p-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              href={todayHref(locale, "rooms", propertyId, {
                show: "free",
                admits: filter,
              })}
              prefetch={false}
            >
              <span className="text-3xl font-light tracking-tight tabular-nums">
                {formatNumber(data[filter], locale)}
              </span>
              <span className="text-xs text-muted-foreground">
                {admits(filter)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
