"use client";

import { useTranslations } from "next-intl";
import type { ImportCounts } from "@ranza/imports/contracts";

const ORDER = [
  "imported",
  "ready",
  "wrong",
  "refused",
  "skipped",
  "left",
] as const;

/** What an import came to, as the counts that are not zero. */
export function ImportCountsLine({ counts }: { counts: ImportCounts }) {
  const t = useTranslations("imports");
  const shown = ORDER.filter((key) => counts[key] > 0);
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {shown.map((key) => (
        <li
          className={
            key === "wrong" || key === "refused"
              ? "font-medium text-warning"
              : "text-muted-foreground"
          }
          key={key}
        >
          {t(`counts.${key}`, { count: counts[key] })}
        </li>
      ))}
    </ul>
  );
}
