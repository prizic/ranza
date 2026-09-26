"use client";

import Link from "next/link";
import {
  CheckCircle2,
  LogIn,
  LogOut,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge, cn, type StatusTone } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import type {
  CleanPriority,
  RoomsCard,
  Section,
} from "../../../server/today-derive";
import { todayHref } from "../links";
import { AllLink } from "./movements-card";
import { SectionUnavailable } from "./section-unavailable";

const PRIORITY: Record<
  CleanPriority,
  { icon: LucideIcon; tone: StatusTone; label: string }
> = {
  arrival: { icon: LogIn, tone: "danger", label: "priorityArrival" },
  inspect_for_arrival: {
    icon: Sparkles,
    tone: "warning",
    label: "priorityInspect",
  },
  leaving: { icon: LogOut, tone: "info", label: "priorityLeaving" },
  queue: { icon: Sparkles, tone: "neutral", label: "priorityQueue" },
};

/**
 * The rooms to clean, in the order somebody needs them (TD-S1-21). Marking a
 * room is the board's command, so each row opens the board; acting from here
 * is slice 2.
 */
export function CleanFirstCard({
  locale,
  onRetry,
  propertyId,
  rooms,
}: {
  locale: SupportedLocale;
  onRetry: () => void;
  propertyId: string;
  rooms: Section<RoomsCard>;
}) {
  const t = useTranslations("dashboard");
  const href = todayHref(locale, "housekeeping", propertyId);

  return (
    <section
      aria-labelledby="today-clean-first"
      className={cn(
        "rounded-[2rem] border border-slate-100 bg-card p-5 md:p-6",
        rooms.status === "ok" && rooms.stale && "opacity-70",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold" id="today-clean-first">
          {t("cleanFirst")}
        </h2>
        {rooms.status === "ok" ? (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {t("roomCount", { count: rooms.data.cleanFirstTotal })}
          </span>
        ) : null}
      </div>
      {rooms.status === "unavailable" ? (
        <SectionUnavailable onRetry={onRetry} />
      ) : rooms.data.cleanFirst.length === 0 ? (
        <p className="flex items-center gap-2.5 rounded-2xl bg-success-soft px-5 py-3.5 font-medium text-success">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          {t("nothingToClean")}
        </p>
      ) : (
        <>
          <ul className="grid gap-2">
            {rooms.data.cleanFirst.map((row) => {
              const priority = PRIORITY[row.priority];
              return (
                <li key={row.unitId}>
                  <Link
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-muted/60 px-4 py-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    href={href}
                    prefetch={false}
                  >
                    <span className="min-w-24 flex-1">
                      <span className="block font-semibold tabular-nums">
                        <bdi>{row.name}</bdi>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {row.floor === null
                          ? t("noFloor")
                          : t("floor", { floor: row.floor })}
                      </span>
                    </span>
                    <StatusBadge
                      icon={priority.icon}
                      label={t(priority.label as "priorityArrival")}
                      tone={priority.tone}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          <AllLink href={href}>{t("wholeBoard")}</AllLink>
        </>
      )}
    </section>
  );
}
