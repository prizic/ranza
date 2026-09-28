"use client";

import Link from "next/link";
import { Moon, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import type { TodaySummary } from "../../../server/today-derive";
import { cutoffTime, dayHeading, shortDay } from "../format";
import { todayHref } from "../links";
import { LocalClock } from "./local-clock";

export type Greeting = "morning" | "afternoon" | "evening";

const GREETING = {
  morning: "greetingMorning",
  afternoon: "greetingAfternoon",
  evening: "greetingEvening",
} as const;

/**
 * The working day, the Property's clock, and how fresh the figures are.
 *
 * The day comes from the live summary, never from when the page was built: a
 * page left open across the cutoff must not keep yesterday's heading over
 * today's figures. Between midnight and the cutoff the working day is still
 * yesterday's, and it says so (TD-S1-09).
 */
export function TodayHeader({
  clock,
  day,
  freshAt,
  greeting,
  locale,
  mayBook,
  name,
  stale,
}: {
  clock: string;
  day: TodaySummary["day"];
  freshAt: string;
  greeting: Greeting;
  locale: SupportedLocale;
  mayBook: boolean;
  name: string;
  stale: boolean;
}) {
  const t = useTranslations("dashboard");
  const afterMidnight = day.calendarDate !== day.businessDate;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
          {dayHeading(day.businessDate, locale)}
        </p>
        <h2 className="text-2xl font-light tracking-tight sm:text-3xl">
          <span className="font-thin text-muted-foreground">
            {t(GREETING[greeting])}
          </span>{" "}
          <bdi className="font-medium">{name}</bdi>
        </h2>
        {afterMidnight ? (
          <p className="flex items-center gap-1.5 text-sm text-warning">
            <Moon aria-hidden="true" className="size-4" />
            {t("workingDayStill", {
              date: shortDay(day.calendarDate, locale),
              time: cutoffTime(day.cutoff, locale),
            })}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs",
            stale
              ? "rounded-full bg-warning-soft px-2.5 py-1 font-medium text-warning"
              : "text-muted-foreground",
          )}
          role="status"
        >
          {stale ? (
            <TriangleAlert aria-hidden="true" className="size-3.5" />
          ) : (
            <RefreshCw aria-hidden="true" className="size-3.5" />
          )}
          {stale
            ? t("stale", { time: freshAt })
            : t("updated", { time: freshAt })}
        </p>
        <p className="flex flex-col">
          <span className="text-4xl leading-none font-light tracking-tight tabular-nums md:text-5xl">
            <LocalClock
              initial={clock}
              locale={locale}
              timeZone={day.timezone}
            />
          </span>
          <span className="mt-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {day.timezone}
          </span>
        </p>
        {mayBook ? (
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            href={todayHref(locale, "reservations", day.propertyId)}
          >
            <Plus aria-hidden="true" className="size-4" />
            {t("newBooking")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
