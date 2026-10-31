"use client";

import { useTranslations } from "next-intl";
import { cn } from "@ranza/ui";
import type { AttendanceFigures } from "@ranza/attendance";
import type { RollFilter } from "../grouping";

interface Figure {
  filter: RollFilter;
  label: string;
  value: number;
  /** The colour a number takes when it is something the desk must act on. */
  tone: "plain" | "danger" | "warning";
  caption?: string | undefined;
}

/**
 * Tonight's five numbers, each a button that narrows the list to the people it
 * counts (LA-S2-04): a figure that cannot be opened is a number the desk has to
 * go and find in the list itself.
 *
 * Missing is Residents marked absent who are not on leave, and is red as soon
 * as it is above nothing. Not yet called is amber only once the curfew has
 * passed: before it, being uncalled is the normal state of the evening.
 */
export function FiguresStrip({
  curfewPassed,
  figures,
  filter,
  onFilter,
}: {
  curfewPassed: boolean;
  figures: AttendanceFigures;
  filter: RollFilter;
  onFilter: (filter: RollFilter) => void;
}) {
  const t = useTranslations("attendance");
  const list: Figure[] = [
    {
      filter: "all",
      label: t("figures.inHouse"),
      value: figures.inHouse,
      tone: "plain",
    },
    {
      filter: "present",
      label: t("figures.present"),
      value: figures.present,
      tone: "plain",
    },
    {
      filter: "on_leave",
      label: t("figures.onLeave"),
      value: figures.onLeave,
      tone: "plain",
    },
    {
      filter: "absent",
      label: t("figures.missing"),
      value: figures.absent,
      tone: figures.absent > 0 ? "danger" : "plain",
    },
    {
      filter: "not_called",
      label: t("figures.notCalled"),
      value: figures.notCalled,
      tone: curfewPassed && figures.notCalled > 0 ? "warning" : "plain",
      caption:
        curfewPassed && figures.notCalled > 0 ? t("afterCurfew") : undefined,
    },
  ];

  return (
    <section aria-label={t("figuresLabel")}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {list.map((figure) => {
          const pressed = filter === figure.filter;
          return (
            <li key={figure.filter}>
              <button
                aria-pressed={pressed}
                className={cn(
                  "flex min-h-24 w-full flex-col justify-between rounded-2xl border bg-card p-4 text-start transition-colors",
                  "hover:border-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
                  pressed && "border-foreground bg-muted",
                )}
                onClick={() => onFilter(pressed ? "all" : figure.filter)}
                type="button"
              >
                <span
                  className={cn(
                    "text-[length:var(--text-step-3)] leading-none font-light tabular-nums",
                    figure.tone === "danger" && "text-danger",
                    figure.tone === "warning" && "text-warning",
                  )}
                >
                  {figure.value}
                </span>
                <span className="mt-3 block text-sm text-muted-foreground">
                  {figure.label}
                  {figure.caption ? (
                    <span className="block text-xs">{figure.caption}</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{t("figureHint")}</p>
    </section>
  );
}
