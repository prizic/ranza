import type { ReactNode } from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * An exception tile.
 *
 * Blueprint 18.4: a dashboard is an operational entry point, not a decorative
 * analytics collection, and every metric must open the filtered records that
 * explain or resolve it. So `href` is required — there is no way to render a
 * number here that goes nowhere — and the whole tile is the target rather than
 * a link tucked in a corner.
 *
 * `detail` carries the qualifier that makes the number mean something: 18 is
 * not useful, "18, 7 checked in" is. It is a node rather than a string so a
 * caller can put a StatusBadge in it when the qualifier is a state.
 */
export interface KpiCardProps {
  className?: string;
  detail?: ReactNode;
  /** Where this number is explained. Required by blueprint 18.4. */
  href: string;
  icon: LucideIcon;
  label: string;
  /** Already formatted, because only the caller knows the locale. */
  value: string;
  /** Draws the tile as an exception rather than a measurement. */
  urgent?: boolean;
}

export function KpiCard({
  className,
  detail,
  href,
  icon: Icon,
  label,
  urgent,
  value,
}: KpiCardProps) {
  return (
    <a
      className={cn(
        "group flex min-w-0 flex-col rounded-lg bg-card p-4 shadow-low transition-shadow hover:shadow-raised",
        urgent && "ring-1 ring-danger/30",
        className,
      )}
      href={href}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "shrink-0 rounded-md p-1.5",
            urgent
              ? "bg-danger-soft text-danger"
              : "bg-accent-soft text-accent-strong",
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>
        {/* min-w-0 or the flex item refuses to shrink and pushes the arrow out. */}
        <p className="min-w-0 truncate text-step--1 text-muted-foreground">
          {label}
        </p>
        <ArrowUpRight
          aria-hidden="true"
          className="ms-auto size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
        />
      </div>

      <p className="mt-4 text-step-3 leading-none font-semibold tabular-nums tracking-tight">
        {value}
      </p>

      {detail ? (
        <div className="mt-1.5 text-step--1 text-muted-foreground">
          {detail}
        </div>
      ) : null}
    </a>
  );
}
