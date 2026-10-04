"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@ranza/ui";

/**
 * One card of the month screen, named by a small uppercase eyebrow the way
 * Today names its figures. The title is the section's accessible name.
 */
export function MonthSection({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "rounded-[2rem] border border-slate-100 bg-card p-5 md:p-6",
        className,
      )}
    >
      <h3
        className="mb-4 text-xs font-medium tracking-wider text-muted-foreground uppercase"
        id={titleId}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}
