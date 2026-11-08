"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@ranza/ui";

/**
 * A request, named wherever a screen names one (MT-12), as the way into it
 * (audit 2026-11-07, B-03). A button, not a link: the sheet it opens belongs to
 * the board, not to an address. It reads as the request's number unless it is
 * given something else to wrap, such as the plan's work-order badge.
 */
export function RequestLink({
  children,
  className,
  onOpen,
  request,
}: {
  children?: ReactNode;
  className?: string;
  onOpen: (requestId: string) => void;
  request: { requestId: string; number: number };
}) {
  const t = useTranslations("maintenance");
  return (
    <button
      className={cn(
        "underline-offset-2 hover:underline focus-visible:underline",
        className,
      )}
      onClick={() => onOpen(request.requestId)}
      type="button"
    >
      {children ?? t("reference", { number: request.number })}
    </button>
  );
}
