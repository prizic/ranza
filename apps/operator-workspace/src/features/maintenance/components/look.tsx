"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  CalendarClock,
  CalendarX,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Clock,
  Flame,
  Hammer,
  Package,
  TimerReset,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type {
  EquipmentCondition,
  Priority,
  RequestStatus,
} from "@ranza/maintenance";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import { StatusBadge, type StatusTone } from "@ranza/ui";

/**
 * How priorities and states read. A word and an icon every time, never colour
 * alone (blueprint 18.5), and the three priorities in the mockup's words.
 */
export const PRIORITY_LOOK: Record<
  Priority,
  { icon: LucideIcon; tone: StatusTone }
> = {
  urgent: { icon: Flame, tone: "danger" },
  this_week: { icon: Clock, tone: "warning" },
  can_wait: { icon: TimerReset, tone: "neutral" },
};

export const STATE_ICON: Record<RequestStatus, LucideIcon> = {
  new: CircleDashed,
  in_progress: Hammer,
  waiting_for_parts: Package,
  done: CircleCheck,
  cancelled: CircleSlash,
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const t = useTranslations("maintenance.priorities");
  const look = PRIORITY_LOOK[priority];
  return <StatusBadge icon={look.icon} label={t(priority)} tone={look.tone} />;
}

const CONDITION_LOOK: Record<
  EquipmentCondition,
  { icon: LucideIcon; tone: StatusTone }
> = {
  working: { icon: CircleCheck, tone: "success" },
  due: { icon: CalendarClock, tone: "warning" },
  overdue: { icon: CalendarX, tone: "danger" },
  fault: { icon: Wrench, tone: "danger" },
};

/** An item's condition: a fault first, then its service date (MT-S3-04). */
export function ConditionBadge({
  condition,
}: {
  condition: EquipmentCondition;
}) {
  const t = useTranslations("maintenance.conditions");
  const look = CONDITION_LOOK[condition];
  return <StatusBadge icon={look.icon} label={t(condition)} tone={look.tone} />;
}

export function OutOfOrderBadge() {
  const t = useTranslations("maintenance");
  return <StatusBadge icon={Wrench} label={t("outOfOrder")} tone="danger" />;
}

/**
 * A calendar day as the Property wrote it. Read at noon UTC and shown in UTC,
 * so no reader's own timezone can move `2026-09-24` onto the 23rd.
 */
export function formatDay(day: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${day}T12:00:00Z`), locale, {
    timeZone: "UTC",
  });
}

/** An instant, in the Property's own timezone. */
export function formatInstant(
  iso: string,
  locale: SupportedLocale,
  timeZone: string,
): string {
  return formatDate(new Date(iso), locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
}

/** A titled block of the request drawer. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}
