"use client";

import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  Clock,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ServiceRequestStatus } from "@ranza/guest-services";
import { StatusBadge, type StatusTone } from "@ranza/ui";

export const STATUS_LOOK: Record<
  ServiceRequestStatus,
  { icon: LucideIcon; tone: StatusTone }
> = {
  new: { icon: Sparkles, tone: "info" },
  in_progress: { icon: Clock, tone: "warning" },
  resolved: { icon: CheckCircle2, tone: "success" },
  cancelled: { icon: XCircle, tone: "neutral" },
};

export function RequestStatusBadge({
  status,
}: {
  status: ServiceRequestStatus;
}) {
  const t = useTranslations("guestExperience.statuses");
  const look = STATUS_LOOK[status] ?? STATUS_LOOK.new;
  return <StatusBadge icon={look.icon} label={t(status)} tone={look.tone} />;
}
