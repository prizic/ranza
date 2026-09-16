import type { LucideIcon } from "lucide-react";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

/**
 * A state, said three ways at once.
 *
 * Blueprint 18.5: every state combines colour with text, icon, or shape, and a
 * coloured dot on its own is a defect. This component makes that structural —
 * there is no way to render one without a label, and the icon is required by
 * the type. A status therefore survives being printed, exported, read aloud, or
 * looked at by someone who cannot separate the greens from the ambers.
 *
 * The tones are the four the theme defines and no more. A screen that wants a
 * fifth meaning needs a fifth token, not a one-off colour class.
 */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE: Record<StatusTone, string> = {
  success: "border-success/25 bg-success-soft text-success",
  warning: "border-warning/25 bg-warning-soft text-warning",
  danger: "border-danger/25 bg-danger-soft text-danger",
  info: "border-info/25 bg-info-soft text-info",
  neutral: "border-border bg-muted text-muted-foreground",
};

export interface StatusBadgeProps {
  className?: string;
  /** Required. The whole point is that colour never travels alone. */
  icon: LucideIcon;
  label: string;
  tone: StatusTone;
}

export function StatusBadge({
  className,
  icon: Icon,
  label,
  tone,
}: StatusBadgeProps) {
  return (
    <Badge className={cn("gap-1.5", TONE[tone], className)} variant="outline">
      <Icon aria-hidden="true" className="size-3" />
      {label}
    </Badge>
  );
}
