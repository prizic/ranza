"use client";

import { useTranslations } from "next-intl";
import { BadgeCheck, Sparkles, SprayCan, type LucideIcon } from "lucide-react";
import type { HousekeepingStatus } from "@ranza/housekeeping";
import { StatusBadge, type StatusTone } from "@ranza/ui";

/**
 * How each status reads. A word and an icon every time, never colour alone
 * (blueprint 18.5, docs/design/visual-reference.md).
 */
export const STATUS_LOOK: Record<
  HousekeepingStatus,
  { icon: LucideIcon; tone: StatusTone }
> = {
  dirty: { icon: SprayCan, tone: "warning" },
  clean: { icon: Sparkles, tone: "success" },
  inspected: { icon: BadgeCheck, tone: "info" },
};

export function HousekeepingStatusBadge({
  status,
}: {
  status: HousekeepingStatus;
}) {
  const t = useTranslations("housekeeping");
  const look = STATUS_LOOK[status];
  return <StatusBadge icon={look.icon} label={t(status)} tone={look.tone} />;
}
