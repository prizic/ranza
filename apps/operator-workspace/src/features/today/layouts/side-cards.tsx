"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { StatusBadge, cn } from "@ranza/ui";
import { formatNumber, localizeHref, type SupportedLocale } from "@ranza/i18n";
import type { RoomState } from "../../../server/today-derive";
import { shortDay } from "../format";
import { todayHref } from "../links";
import { OpenLink, Panel, STATE_ORDER, StateBadge } from "./parts";

const SEGMENT: Record<RoomState, string> = {
  in_house: "bg-primary",
  ready: "bg-success/70",
  awaiting_inspection: "bg-warning-soft ring-1 ring-warning ring-inset",
  dirty:
    "bg-danger-soft ring-1 ring-danger ring-inset [background-image:repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--danger)_18%,transparent)_6px_8px)]",
  out_of_service:
    "bg-muted ring-1 ring-line-strong ring-inset [background-image:repeating-linear-gradient(45deg,transparent_0_6px,color-mix(in_srgb,var(--ink-muted)_20%,transparent)_6px_8px)]",
};

/** The house in one bar: how much of it is people, how much is ready, how much is work. */
export function RoomsBar({
  counts,
  locale,
  propertyId,
  sellable,
}: {
  counts: Record<RoomState, number>;
  locale: SupportedLocale;
  propertyId: string;
  sellable: number;
}) {
  const t = useTranslations("todayLayouts");
  return (
    <Panel labelledBy="rooms-bar-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-xl font-semibold tracking-tight"
          id="rooms-bar-title"
        >
          {t("rooms.title")}
        </h2>
        <OpenLink href={todayHref(locale, "housekeeping", propertyId)}>
          {t("rooms.open")}
        </OpenLink>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("rooms.sellable", { count: sellable })}
      </p>
      <div
        className="my-5 flex h-4 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={t("rooms.title")}
      >
        {STATE_ORDER.filter((state) => counts[state] > 0).map((state) => (
          <span
            className={cn("min-w-1.5", SEGMENT[state])}
            key={state}
            style={{ flex: counts[state] }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
        {STATE_ORDER.map((state) => (
          <li
            className="flex items-center justify-between gap-2 text-sm"
            key={state}
          >
            <StateBadge state={state} />
            <span className="font-semibold tabular-nums">
              {formatNumber(counts[state], locale)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** `YYYY-MM-DD` plus whole days, as `YYYY-MM-DD`; a day, not an instant. */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const DAYS_SHOWN = 8;

/**
 * Days past their cutoff that nobody has closed. A day's nights are charged
 * when it is closed, so every one of these is revenue not yet posted, which is
 * why it is not drawn as a routine notice.
 */
export function UnclosedDaysCard({
  locale,
  oldest,
  propertyId,
  waiting,
}: {
  locale: SupportedLocale;
  oldest: string | null;
  propertyId: string;
  waiting: number;
}) {
  const t = useTranslations("todayLayouts");
  const days = oldest
    ? Array.from({ length: Math.min(waiting, DAYS_SHOWN) }, (_, i) =>
        addDays(oldest, i),
      )
    : [];
  return (
    <Panel className="border-warning/40" labelledBy="unclosed-title">
      <StatusBadge
        icon={CalendarDays}
        label={t("unclosed.badge")}
        tone="warning"
      />
      <h2
        className="mt-3 text-xl font-semibold tracking-tight"
        id="unclosed-title"
      >
        {t("unclosed.title", { count: waiting })}
      </h2>
      {oldest ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {t("unclosed.body", { date: shortDay(oldest, locale) })}
        </p>
      ) : null}
      <ol className="my-4 flex gap-1.5" aria-hidden="true">
        {days.map((day, index) => (
          <li
            className={cn(
              "grid h-8 flex-1 place-items-center rounded-lg text-xs font-semibold tabular-nums",
              index === 0
                ? "bg-warning text-primary-foreground"
                : "bg-warning-soft text-warning",
            )}
            key={day}
          >
            {formatNumber(Number(day.slice(8)), locale)}
          </li>
        ))}
      </ol>
      <Link
        className="inline-flex min-h-9 items-center rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href={`${localizeHref(locale, "close-day")}?property=${encodeURIComponent(propertyId)}`}
      >
        {t("unclosed.open")}
      </Link>
    </Panel>
  );
}
