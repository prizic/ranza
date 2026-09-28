"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@ranza/ui";

/**
 * A card whose read failed, standing alone among cards that did not
 * (TD-S1-24). The failure itself was logged on the server when it happened.
 */
export function SectionUnavailable({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("dashboard");
  return (
    <div
      className="flex min-h-40 flex-col justify-center gap-2 rounded-[2rem] border border-danger/15 bg-danger-soft p-5 text-danger"
      role="status"
    >
      <span className="flex items-center gap-2 font-semibold">
        <AlertTriangle aria-hidden="true" className="size-4" />
        {t("sectionUnavailable")}
      </span>
      <span className="text-sm">{t("sectionUnavailableDescription")}</span>
      <Button
        className="w-fit rounded-full"
        onClick={onRetry}
        size="sm"
        type="button"
        variant="outline"
      >
        <RefreshCw aria-hidden="true" className="size-3.5" />
        {t("retry")}
      </Button>
    </div>
  );
}
