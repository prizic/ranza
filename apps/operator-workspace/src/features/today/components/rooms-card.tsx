"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import type { RoomsCard as Rooms, Section } from "../../../server/today-derive";
import { todayHref } from "../links";
import { SectionUnavailable } from "./section-unavailable";

/**
 * Readiness at a glance, then by floor. The bar is decoration for the counts
 * beside it, which say the same thing in words (blueprint 18.5).
 */
export function RoomsCard({
  locale,
  onRetry,
  propertyId,
  rooms,
}: {
  locale: SupportedLocale;
  onRetry: () => void;
  propertyId: string;
  rooms: Section<Rooms>;
}) {
  const t = useTranslations("dashboard");

  return (
    <section
      aria-labelledby="today-rooms"
      className={cn(
        "rounded-[2rem] border border-slate-100 bg-card p-5 md:p-6",
        rooms.status === "ok" && rooms.stale && "opacity-70",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold" id="today-rooms">
          {t("rooms")}
        </h2>
        <Link
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          href={todayHref(locale, "housekeeping", propertyId)}
        >
          {t("openBoard")}
          <ArrowRight aria-hidden="true" className="size-3 rtl:rotate-180" />
        </Link>
      </div>
      {rooms.status === "unavailable" ? (
        <SectionUnavailable onRetry={onRetry} />
      ) : (
        <Breakdown locale={locale} rooms={rooms.data} />
      )}
    </section>
  );
}

function Breakdown({
  locale,
  rooms,
}: {
  locale: SupportedLocale;
  rooms: Rooms;
}) {
  const t = useTranslations("dashboard");
  const parts = [
    { key: "ready", count: rooms.ready, swatch: "bg-success" },
    { key: "awaiting", count: rooms.awaitingInspection, swatch: "bg-warning" },
    { key: "dirty", count: rooms.dirty, swatch: "bg-danger" },
    { key: "outOfService", count: rooms.outOfService, swatch: "bg-border" },
  ] as const;

  return (
    <>
      <div
        aria-hidden="true"
        className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted"
      >
        {parts.map((part) =>
          part.count > 0 ? (
            <span
              className={part.swatch}
              key={part.key}
              style={{ flexGrow: part.count }}
            />
          ) : null,
        )}
      </div>
      <dl className="mt-4 grid gap-2">
        {parts.map((part) => (
          <div className="flex items-center gap-2.5 text-sm" key={part.key}>
            <span
              aria-hidden="true"
              className={cn("size-3 rounded", part.swatch)}
            />
            <dt className="flex-1">{t(part.key)}</dt>
            <dd className="font-semibold tabular-nums">
              {formatNumber(part.count, locale)}
            </dd>
          </div>
        ))}
      </dl>
      {rooms.floors.length > 1 ? (
        <section
          aria-label={t("roomsByFloor")}
          className="mt-4 grid gap-2.5 border-t border-border pt-4"
        >
          {rooms.floors.map((floor) => (
            <div className="text-sm" key={floor.floor ?? "none"}>
              <div className="mb-1 flex justify-between">
                <span>
                  {floor.floor === null
                    ? t("noFloor")
                    : t("floor", { floor: formatNumber(floor.floor, locale) })}
                </span>
                <span className="tabular-nums">
                  {t("floorReady", {
                    count: formatNumber(floor.ready, locale),
                    of: formatNumber(floor.total, locale),
                  })}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${floor.total ? Math.round((floor.ready / floor.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
