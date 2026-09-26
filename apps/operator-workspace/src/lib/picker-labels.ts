import { useTranslations } from "next-intl";
import type { MultiComboboxLabels } from "@ranza/ui";

/**
 * A searchable picker's strings, for the field that names its placeholder.
 * The rest are the same on every picker, so they are assembled here.
 */
export function usePickerLabels(placeholder: string): MultiComboboxLabels {
  const t = useTranslations("picker");
  return {
    clear: t("clear"),
    noMatches: t("noMatches"),
    placeholder,
    search: t("search"),
    selected: (n) => t("selectedCount", { n }),
  };
}
