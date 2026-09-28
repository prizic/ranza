import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@ranza/ui";

/**
 * One figure, as Leaders draws them: a quiet icon and the list it opens above
 * a large light numeral, its label, and a line or a bar under it.
 *
 * The whole tile is the link, because every figure on this page is a way into
 * the records that explain it (blueprint 18.4).
 */
export function StatTile({
  accent = false,
  children,
  href,
  icon: Icon,
  label,
  opens,
  progress,
  stale = false,
  sub,
}: {
  accent?: boolean;
  children: ReactNode;
  href: string;
  icon: LucideIcon;
  label: string;
  opens: string;
  /** 0–1 for the solid part; `ahead` for a lighter part after it. */
  progress?: { done: number; ahead?: number } | undefined;
  stale?: boolean;
  sub?: ReactNode;
}) {
  return (
    <Link
      className={cn(
        "group flex min-h-40 flex-col rounded-[2rem] border border-slate-100 bg-card p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        stale && "opacity-70",
      )}
      href={href}
    >
      <span className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-2xl",
            accent ? "bg-secondary text-primary" : "bg-muted text-primary",
          )}
        >
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
          {opens}
          <ArrowRight aria-hidden="true" className="size-3 rtl:rotate-180" />
        </span>
      </span>
      <span className="mt-5 block">
        <span className="block text-4xl leading-none font-light tracking-tight tabular-nums md:text-5xl">
          {children}
        </span>
        <span className="mt-2 block text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </span>
        {sub ? (
          <span className="mt-1 block text-sm text-muted-foreground">
            {sub}
          </span>
        ) : null}
      </span>
      {/* Pinned to the foot, so bars line up across a row whatever the
          lines above them say. */}
      {progress ? (
        <span aria-hidden="true" className="mt-auto block pt-3">
          <span className="flex h-1.5 overflow-hidden rounded-full bg-secondary">
            <span
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round(progress.done * 100)}%` }}
            />
            {progress.ahead ? (
              <span
                className="h-full bg-primary/25"
                style={{ width: `${Math.round(progress.ahead * 100)}%` }}
              />
            ) : null}
          </span>
        </span>
      ) : null}
    </Link>
  );
}

/** The numeral and a smaller "of" after it: 7 / 18. */
export function OfTotal({ of, value }: { of: string; value: string }) {
  return (
    <>
      {value}
      <span className="text-xl text-muted-foreground"> / {of}</span>
    </>
  );
}
