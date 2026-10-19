"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarClock,
  CheckCircle2,
  Clock,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@ranza/ui";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import type {
  AttentionItem,
  AttentionKind,
} from "../../../server/today-derive";
import { unitLabel } from "../../front-office/unit-label";
import { todayHref } from "../links";
import { money, shortDay } from "../format";

/** How many show before the rest fold into "N more" (TD-S1-18). */
export const ATTENTION_SHOWN = 4;

const KIND: Record<
  AttentionKind,
  { icon: LucideIcon; tone: StatusTone; label: string }
> = {
  days_waiting: { icon: CalendarClock, tone: "warning", label: "daysWaiting" },
  not_ready: { icon: AlertTriangle, tone: "danger", label: "notReady" },
  blocked: { icon: BedDouble, tone: "info", label: "blocked" },
  urgent_repair: { icon: Wrench, tone: "danger", label: "urgentRepair" },
  overdue: { icon: Clock, tone: "warning", label: "overdue" },
  balance: { icon: Wallet, tone: "warning", label: "leavesOwing" },
  overdue_return: { icon: Clock, tone: "warning", label: "dueBack" },
  out_of_service: { icon: Wrench, tone: "neutral", label: "outOfService" },
};

const NOT_READY = {
  dirty: "notReadyDirty",
  awaiting_inspection: "notReadyAwaitingInspection",
  occupied: "notReadyOccupied",
  out_of_service: "notReadyOutOfService",
  unknown: "notReadyDetail",
} as const;

const BLOCKER = {
  not_confirmed: "blockerNotConfirmed",
  unit_blocked: "blockerUnitBlocked",
  unit_out_of_service: "blockerUnitOutOfService",
  unit_occupied: "blockerUnitOccupied",
} as const;

export function AttentionQueue({
  complete,
  currency,
  items,
  locale,
  propertyId,
  roomsBoard,
  mayMark,
}: {
  complete: boolean;
  currency: string;
  items: readonly AttentionItem[];
  locale: SupportedLocale;
  propertyId: string;
  /** Whether the housekeeping board is open to the viewer here. */
  roomsBoard: boolean;
  /** Whether the viewer may mark rooms there: the one tap that readies one. */
  mayMark: boolean;
}) {
  const t = useTranslations("dashboard");
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    // Said, never hidden: an empty row would read as a failure (TD-S1-19). A
    // list built from a section that could not be read is not "nothing".
    return (
      <section aria-labelledby="today-attention">
        <h2 className="sr-only" id="today-attention">
          {t("attentionTitle")}
        </h2>
        {complete ? (
          <p className="flex items-center gap-2.5 rounded-2xl bg-success-soft px-5 py-3.5 font-medium text-success">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            {t("nothingNeedsAttention")}
          </p>
        ) : (
          <p className="flex items-center gap-2.5 rounded-2xl bg-warning-soft px-5 py-3.5 font-medium text-warning">
            <AlertTriangle aria-hidden="true" className="size-4" />
            {t("attentionIncomplete")}
          </p>
        )}
      </section>
    );
  }

  // Days waiting to be closed are the whole Property's and never folded, and
  // they never take one of the places a room's item would have (TD-S7-11).
  const backlog = items.filter((item) => item.kind === "days_waiting");
  const rooms = items.filter((item) => item.kind !== "days_waiting");
  const shown = [
    ...backlog,
    ...(expanded ? rooms : rooms.slice(0, ATTENTION_SHOWN)),
  ];
  const hidden = items.length - shown.length;

  function detail(item: AttentionItem): string | null {
    switch (item.kind) {
      case "days_waiting":
        return item.dueOn
          ? t("daysWaitingDetail", { date: shortDay(item.dueOn, locale) })
          : null;
      case "not_ready":
        return t(NOT_READY[item.notReady ?? "unknown"]);
      case "blocked":
        return item.blocker ? t(BLOCKER[item.blocker]) : t("blocked");
      case "overdue":
        return item.dueOn
          ? t("overdueDetail", {
              days: item.overdueDays ?? 0,
              date: shortDay(item.dueOn, locale),
            })
          : t("overdue");
      case "balance":
        return t("leavesOwingDetail", {
          balance: money(item.balance ? [item.balance] : [], currency, locale),
        });
      case "urgent_repair":
      case "overdue_return":
        return item.dueOn
          ? t("dueBackDetail", { date: shortDay(item.dueOn, locale) })
          : null;
      case "out_of_service":
        return t("outOfServiceDetail");
    }
  }

  function way(item: AttentionItem): { href: string; label: string } {
    // Only a maintenance viewer is sent a request (TD-S4-03); the board opens
    // at the Property, since it has no request to open at yet (TD-DEF-09).
    if (item.request) {
      return {
        href: todayHref(locale, "maintenance", propertyId),
        label: t("openMaintenance"),
      };
    }
    switch (item.kind) {
      case "days_waiting":
        return {
          href: todayHref(locale, "close-day", propertyId),
          label: t("openCloseDay"),
        };
      case "not_ready":
        // Somebody who may mark the room goes to the board, where one tap
        // readies it for the arrival; the desk without that permission goes
        // to the arrivals, where the Guest is.
        if (roomsBoard && (mayMark || item.guestName === null)) {
          return {
            href: todayHref(locale, "housekeeping", propertyId, {
              show: "for_arrival",
            }),
            label: t("openBoard"),
          };
        }
        return {
          href: todayHref(locale, "arrivals", propertyId),
          label: t("openArrivals"),
        };
      case "blocked":
        return {
          href: todayHref(locale, "arrivals", propertyId),
          label: t("openArrivals"),
        };
      case "overdue":
      case "balance":
        return item.folioId && item.kind === "balance"
          ? {
              href: todayHref(locale, "finance", propertyId, {
                folio: item.folioId,
              }),
              label: t("openFolio"),
            }
          : {
              href: todayHref(locale, "departures", propertyId),
              label: t("openDepartures"),
            };
      case "urgent_repair":
      case "overdue_return":
        return {
          href: todayHref(locale, "maintenance", propertyId),
          label: t("openMaintenance"),
        };
      case "out_of_service":
        return roomsBoard
          ? {
              href: todayHref(locale, "housekeeping", propertyId),
              label: t("openBoard"),
            }
          : {
              href: todayHref(locale, "rooms", propertyId),
              label: t("openRooms"),
            };
    }
  }

  return (
    <section aria-labelledby="today-attention">
      <h2
        className="flex items-center gap-2 text-base font-semibold"
        id="today-attention"
      >
        {t("attentionTitle")}
        <span className="rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground tabular-nums">
          {formatNumber(items.length, locale)}
        </span>
      </h2>
      {complete ? null : (
        <p className="mt-1 text-sm text-warning">{t("attentionIncomplete")}</p>
      )}
      <ul className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
        {shown.map((item, index) => {
          const kind = KIND[item.kind];
          const target = way(item);
          const subject =
            item.kind === "days_waiting"
              ? t("daysWaitingCount", { count: item.waiting ?? 0 })
              : item.unit
                ? unitLabel(item.unit.roomName, item.unit.unitName)
                : (item.request?.equipmentName ?? null);
          const said = detail(item);
          return (
            <li
              key={`${item.kind}-${subject ?? item.request?.number}-${index}`}
            >
              <Link
                className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-xs transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                href={target.href}
                prefetch={false}
              >
                <StatusBadge
                  icon={kind.icon}
                  label={t(kind.label as "notReady")}
                  tone={kind.tone}
                />
                <span className="font-semibold">
                  {subject ? <bdi>{subject}</bdi> : null}
                  {item.guestName ? (
                    <>
                      {" · "}
                      <bdi>{item.guestName}</bdi>
                    </>
                  ) : null}
                  {item.kind === "overdue" && item.balance
                    ? ` · ${money([item.balance], currency, locale)}`
                    : null}
                </span>
                {item.request ? (
                  <span className="line-clamp-2 text-sm text-muted-foreground">
                    {t("requestReference", { number: item.request.number })}
                    {" · "}
                    <bdi>{item.request.title}</bdi>
                  </span>
                ) : null}
                {said ? (
                  <span className="text-sm text-muted-foreground">{said}</span>
                ) : null}
                <span className="mt-auto flex items-center gap-1.5 text-sm font-semibold text-primary">
                  {target.label}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-3.5 rtl:rotate-180"
                  />
                </span>
              </Link>
            </li>
          );
        })}
        {hidden > 0 ? (
          <li>
            <button
              className="flex h-full min-h-24 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card p-4 text-sm font-semibold text-primary transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => setExpanded(true)}
              type="button"
            >
              {t("attentionMore", { count: hidden })}
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
