import { useTranslations } from "next-intl";
import type { ServiceRequestCategory } from "@ranza/guest-services";
import { Badge } from "@ranza/ui";

const CATEGORY_STYLES: Record<ServiceRequestCategory, string> = {
  housekeeping:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  maintenance:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  amenities:
    "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
  front_desk:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  other: "bg-muted text-muted-foreground border-border",
};

export function CategoryBadge({
  category,
}: {
  category: ServiceRequestCategory;
}) {
  const t = useTranslations("guestExperience.categories");
  const label = t(category);

  return (
    <Badge
      variant="outline"
      className={CATEGORY_STYLES[category] || CATEGORY_STYLES.other}
    >
      {label}
    </Badge>
  );
}
