"use client";

import { LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import { TODAY_LAYOUTS, type TodayLayout } from "./model";

/**
 * Which drawing of Today this Staff Member works from. A preference of the
 * person, kept on the device (docs/features/today-layouts, TL-S1-03): it
 * changes how the day is drawn and nothing the viewer may see or do.
 */
export function LayoutSwitcher({
  onChange,
  value,
}: {
  onChange: (layout: TodayLayout) => void;
  value: TodayLayout;
}) {
  const t = useTranslations("todayLayouts");
  return (
    <Select
      onValueChange={(next) => {
        const layout = TODAY_LAYOUTS.find((candidate) => candidate === next);
        if (layout) onChange(layout);
      }}
      value={value}
    >
      <SelectTrigger
        aria-label={t("switcher.label")}
        className="h-10 min-w-44 gap-2 rounded-full bg-card"
      >
        <LayoutDashboard aria-hidden="true" className="size-4" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TODAY_LAYOUTS.map((layout) => (
          <SelectItem key={layout} value={layout}>
            <span className="flex flex-col items-start">
              <span className="font-medium">
                {t(`switcher.names.${layout}`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`switcher.hints.${layout}`)}
              </span>
            </span>
          </SelectItem>
        ))}
        <p className="border-t border-line px-2 pt-2 pb-1 text-xs text-muted-foreground">
          {t("switcher.saved")}
        </p>
      </SelectContent>
    </Select>
  );
}
