"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import type {
  BookedAheadCard as BookedAhead,
  BookedNight,
  Section,
} from "../../../server/today-derive";
import { percent, shortDay } from "../format";
import { todayHref } from "../links";
import { SectionUnavailable } from "./section-unavailable";

const WIDTH = 280;
const HEIGHT = 72;
const INSET = 6;

/** A night's booked share of the Units in use, 0 to 1; null with none in use. */
function shareOf(night: BookedNight): number | null {
  return night.inUse > 0 ? night.booked / night.inUse : null;
}

/**
 * Booked occupancy over the nights ahead, as a line (TD-S3-04): the bookings and
 * Stays the Property already holds, never a forecast. The line is the way into
 * the room calendar, where each of those nights is a bar; a visually hidden
 * table carries every value, because a line shows a shape and not a number.
 */
export function BookedAheadCard({
  booked,
  locale,
  onRetry,
  propertyId,
}: {
  booked: Section<BookedAhead>;
  locale: SupportedLocale;
  onRetry: () => void;
  propertyId: string;
}) {
  const t = useTranslations("dashboard");

  return (
    <section
      aria-labelledby="today-booked"
      className={cn(
        "rounded-[2rem] border border-slate-100 bg-card p-5 md:p-6",
        booked.status === "ok" && booked.stale && "opacity-70",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold" id="today-booked">
          {t("bookedTitle")}
        </h2>
        <span className="text-xs text-muted-foreground">{t("bookedNote")}</span>
      </div>
      {booked.status === "unavailable" ? (
        <SectionUnavailable onRetry={onRetry} />
      ) : (
        <Line
          href={todayHref(locale, "room-calendar", propertyId)}
          locale={locale}
          nights={booked.data.nights}
        />
      )}
    </section>
  );
}

function Line({
  href,
  locale,
  nights,
}: {
  href: string;
  locale: SupportedLocale;
  nights: readonly BookedNight[];
}) {
  const t = useTranslations("dashboard");
  const first = nights[0];
  const last = nights.at(-1);
  if (!first || !last || nights.every((night) => night.inUse === 0)) {
    return <p className="text-sm text-muted-foreground">{t("noUnits")}</p>;
  }

  const step =
    nights.length > 1 ? (WIDTH - 2 * INSET) / (nights.length - 1) : 0;
  const points = nights.map((night, index) => ({
    x: INSET + index * step,
    y: INSET + (1 - (shareOf(night) ?? 0)) * (HEIGHT - 2 * INSET),
  }));
  const share = (night: BookedNight) =>
    percent(night.booked, night.inUse, locale) ?? "—";

  return (
    <>
      <Link
        className="group block rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href={href}
        prefetch={false}
      >
        <svg
          aria-hidden="true"
          className="h-20 w-full overflow-visible text-primary"
          preserveAspectRatio="none"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          <line
            className="stroke-border"
            strokeDasharray="2 4"
            x1={INSET}
            x2={WIDTH - INSET}
            y1={HEIGHT / 2}
            y2={HEIGHT / 2}
          />
          <polyline
            className="fill-none stroke-current"
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="mt-2 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {shortDay(first.day, locale)}{" "}
            <b className="text-sm font-semibold text-foreground tabular-nums">
              {share(first)}
            </b>
          </span>
          <span className="flex items-center gap-1 transition-colors group-hover:text-foreground">
            {t("openCalendar")}
            <ArrowRight aria-hidden="true" className="size-3 rtl:rotate-180" />
          </span>
          <span>
            {shortDay(last.day, locale)}{" "}
            <b className="text-sm font-semibold text-foreground tabular-nums">
              {share(last)}
            </b>
          </span>
        </span>
        <table className="sr-only">
          <caption>{t("bookedTitle")}</caption>
          <thead>
            <tr>
              <th>{t("bookedColNight")}</th>
              <th>{t("bookedColUnits")}</th>
              <th>{t("bookedColShare")}</th>
            </tr>
          </thead>
          <tbody>
            {nights.map((night) => (
              <tr key={night.day}>
                <th scope="row">{shortDay(night.day, locale)}</th>
                <td>
                  {t("bookedOf", {
                    count: formatNumber(night.booked, locale),
                    of: formatNumber(night.inUse, locale),
                  })}
                </td>
                <td>{share(night)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Link>
    </>
  );
}
