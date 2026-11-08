"use client";

import { useTranslations } from "next-intl";
import { cn } from "@ranza/ui";

/**
 * A request's number (MT-12) as the way into the request, wherever a screen
 * names one (audit 2026-11-07, B-03). A button, not a link: the sheet it opens
 * belongs to the board, not to an address.
 */
export function RequestLink({
  className,
  number,
  onOpen,
}: {
  className?: string;
  number: number;
  onOpen: () => void;
}) {
  const t = useTranslations("maintenance");
  return (
    <button
      className={cn(
        "underline-offset-2 hover:underline focus-visible:underline",
        className,
      )}
      onClick={onOpen}
      type="button"
    >
      {t("reference", { number })}
    </button>
  );
}
