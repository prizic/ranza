import { useTranslations } from "next-intl";
import type { ServiceRequestPriority } from "@ranza/guest-services";
import { Badge } from "@ranza/ui";

const PRIORITY_STYLES: Record<ServiceRequestPriority, string> = {
  urgent:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800 font-semibold",
  high: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  normal:
    "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-800",
  low: "bg-muted/50 text-muted-foreground border-border",
};

export function PriorityBadge({
  priority,
}: {
  priority: ServiceRequestPriority;
}) {
  const t = useTranslations("guestExperience.priorities");
  const label = t(priority);

  return (
    <Badge
      variant="outline"
      className={PRIORITY_STYLES[priority] || PRIORITY_STYLES.normal}
    >
      {label}
    </Badge>
  );
}
