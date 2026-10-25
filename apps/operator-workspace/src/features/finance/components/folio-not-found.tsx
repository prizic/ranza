import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * What a `?folio=` that did not open says: one line above the list, the same
 * for a Folio at another Property, one that never existed and one the viewer's
 * role cannot read, so it confirms nothing about which of those it was
 * (FINANCE-12).
 */
export function FolioNotFound() {
  const t = useTranslations("finance");
  return (
    <p
      className="mt-3 flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-foreground"
      data-testid="folio-not-found"
      role="status"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {t("folioNotFound")}
    </p>
  );
}
