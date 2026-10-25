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
        <Breakdown locale={locale} propertyId={propertyId} rooms={rooms.data} />
      )}
    </section>
  );
}

const LINK =
  "-mx-2 rounded-lg px-2 py-0.5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function Breakdown({
  locale,
  propertyId,
  rooms,
}: {
  locale: SupportedLocale;
  propertyId: string;
  rooms: Rooms;
}) {
  const t = useTranslations("dashboard");
  const parts = [
    {
      key: "ready",
      count: rooms.ready,
      show: "ready",
      swatch: "bg-success",
    },
    {
      key: "awaiting",
      count: rooms.awaitingInspection,
      show: "awaiting_inspection",
      swatch: "bg-warning",
    },
    { key: "dirty", count: rooms.dirty, show: "dirty", swatch: "bg-danger" },
    {
      key: "outOfService",
      count: rooms.outOfService,
      show: "out_of_service",
      swatch: "bg-border",
    },
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
      <ul className="mt-4 grid gap-1">
        {parts.map((part) => (
          <li key={part.key}>
            <Link
              className={cn("flex items-center gap-2.5 text-sm", LINK)}
              href={todayHref(locale, "housekeeping", propertyId, {
                show: part.show,
              })}
              prefetch={false}
            >
              <span
                aria-hidden="true"
                className={cn("size-3 rounded", part.swatch)}
              />
              <span className="flex-1">{t(part.key)}</span>
              <span className="font-semibold tabular-nums">
                {formatNumber(part.count, locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("roomsEmptyOnly")}
      </p>
      {rooms.floors.length > 1 ? (
        <section
          aria-label={t("roomsByFloor")}
          className="mt-4 grid gap-2.5 border-t border-border pt-4"
        >
          {rooms.floors.map((floor) => (
            <Link
              className={cn("block text-sm", LINK)}
              href={todayHref(locale, "housekeeping", propertyId, {
                floor: floor.floor === null ? "none" : String(floor.floor),
              })}
              key={floor.floor ?? "none"}
              prefetch={false}
            >
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
            </Link>
          ))}
        </section>
      ) : null}
    </>
  );
}
