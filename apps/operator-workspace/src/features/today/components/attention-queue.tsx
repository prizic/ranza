"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CheckCircle2,
  Clock,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
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
  not_ready: { icon: AlertTriangle, tone: "danger", label: "notReady" },
  blocked: { icon: BedDouble, tone: "info", label: "blocked" },
  overdue: { icon: Clock, tone: "warning", label: "overdue" },
  balance: { icon: Wallet, tone: "warning", label: "leavesOwing" },
  out_of_service: { icon: Wrench, tone: "neutral", label: "outOfService" },
};

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
}: {
  complete: boolean;
  currency: string;
  items: readonly AttentionItem[];
  locale: SupportedLocale;
  propertyId: string;
  /** Whether the housekeeping board is open to the viewer here. */
  roomsBoard: boolean;
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

  const shown = expanded ? items : items.slice(0, ATTENTION_SHOWN);
  const hidden = items.length - shown.length;

  function detail(item: AttentionItem): string {
    switch (item.kind) {
      case "not_ready":
        return t("notReadyDetail");
      case "blocked":
        return item.blocker ? t(BLOCKER[item.blocker]) : t("blocked");
      case "overdue":
        return item.dueOn
          ? t("overdueDetail", { date: shortDay(item.dueOn, locale) })
          : t("overdue");
      case "balance":
        return t("leavesOwingDetail", {
          balance: money(item.balance ? [item.balance] : [], currency, locale),
        });
      case "out_of_service":
        return t("outOfServiceDetail");
    }
  }

  function way(item: AttentionItem): { href: string; label: string } {
    switch (item.kind) {
      case "not_ready":
        // Somebody whose work is the room, not the Guest, is sent to the
        // board where the room is marked (the item names no Guest for them).
        if (roomsBoard && item.guestName === null) {
          return {
            href: todayHref(locale, "housekeeping", propertyId),
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
          {items.length}
        </span>
      </h2>
      {complete ? null : (
        <p className="mt-1 text-sm text-warning">{t("attentionIncomplete")}</p>
      )}
      <ul className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
        {shown.map((item, index) => {
          const kind = KIND[item.kind];
          const target = way(item);
          const unit = unitLabel(item.unit.roomName, item.unit.unitName);
          return (
            <li key={`${item.kind}-${unit}-${index}`}>
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
                  <bdi>{unit}</bdi>
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
                <span className="text-sm text-muted-foreground">
                  {detail(item)}
                </span>
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
