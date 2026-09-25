"use client";

import { useTranslations } from "next-intl";
import { cn } from "@ranza/ui";
import {
  BAR_ICON,
  BAR_LOOK,
  OUT_OF_USE,
  WARNING_ICON,
  type BarLook,
  type BarWarning,
} from "./bar-style";

const LOOKS: BarLook[] = [
  "requested",
  "confirmed",
  "inHouse",
  "overdue",
  "departed",
];
const WARNINGS: BarWarning[] = ["overlap", "bookedWhileBlocked", "clashes"];

/** What every mark on the calendar means, in words (RC-S1-59). */
export function Legend() {
  const t = useTranslations("roomCalendar");
  return (
    <ul
      aria-label={t("legend")}
      className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1.5 p-0 text-xs text-muted-foreground"
    >
      {LOOKS.map((look) => {
        const Icon = BAR_ICON[look];
        return (
          <li className="inline-flex items-center gap-1.5" key={look}>
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex h-4 w-7 items-center justify-center rounded-sm",
                BAR_LOOK[look],
              )}
            >
              <Icon className="size-3" />
            </span>
            {t(look)}
          </li>
        );
      })}
      {WARNINGS.map((warning) => {
        const Icon = WARNING_ICON[warning];
        return (
          <li className="inline-flex items-center gap-1.5" key={warning}>
            <Icon aria-hidden="true" className="size-3.5 text-danger" />
            {t(warning)}
          </li>
        );
      })}
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn("h-4 w-7 rounded-sm border", OUT_OF_USE)}
        />
        {t("blocked")}
      </li>
    </ul>
  );
}
