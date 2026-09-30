"use client";

import type { ReactNode } from "react";
import { Lock, type LucideIcon } from "lucide-react";
import { cn } from "@ranza/ui";

interface KpiCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  masked?: boolean;
  extra?: ReactNode;
  tone?: "default" | "primary" | "emerald";
}

export function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  masked = false,
  extra,
  tone = "default",
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-5 shadow-xs transition-shadow hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/60",
        tone === "primary" && "border-primary/20 bg-primary/[0.02]",
        tone === "emerald" && "border-emerald-500/20 bg-emerald-500/[0.02]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {title}
        </p>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
            tone === "primary" &&
              "bg-primary/10 text-primary dark:bg-primary/20",
            tone === "emerald" &&
              "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
          )}
        >
          <Icon aria-hidden="true" className="size-4.5" />
        </span>
      </div>

      <div className="mt-4">
        {masked ? (
          <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
            <Lock aria-hidden="true" className="size-4" />
            <span className="text-xl font-semibold tracking-wide">••••••</span>
          </div>
        ) : (
          <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
            {value}
          </p>
        )}

        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      {extra && (
        <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800/80 dark:text-slate-400">
          {extra}
        </div>
      )}
    </div>
  );
}
