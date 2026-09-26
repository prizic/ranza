import type { ComponentType, ReactNode } from "react";
import { cn } from "../lib/utils";
import { Card } from "./ui/card";
import { Label } from "./ui/label";

/**
 * The shapes this product repeats, as opposed to the ones shadcn supplies.
 *
 * Each is here because it appears on several screens across both applications,
 * not because a page might want it one day. A pattern with one caller belongs
 * in that caller.
 */

/**
 * The rule under a page's title, with room for one fact opposite it.
 *
 * The heading itself is the page's own: Today sets a weekday in display type
 * and Security sets a line of running text, and a shared component that tried
 * to size both would end up with a variant per page.
 *
 * That heading starts at `h2`. The page bar above it (`AppPageBar`) already
 * renders the route's one `h1` — as the large title under the bar, or as the
 * breadcrumb's last crumb when the page opens with display type of its own
 * (`display={false}`) — so a caller that puts an `h1` in here doubles it.
 */
export function PageHeader({
  aside,
  children,
  className,
}: {
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-8 gap-y-4 border-b border-border pb-5",
        className,
      )}
    >
      <div>{children}</div>
      {aside}
    </header>
  );
}

/** Stored values, side by side. Never derived ones — those belong in prose. */
export function FactList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "m-0 grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-8 pt-7",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function Fact({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-step--1 text-muted-foreground">{label}</dt>
      <dd className="m-0 text-step-1">{children}</dd>
    </div>
  );
}

/**
 * A labelled control.
 *
 * Takes the input as children rather than rendering one, so a caller keeps
 * every attribute that matters for autofill, validation and one-time codes —
 * the things a wrapper is most likely to drop.
 */
export function Field({
  children,
  className,
  hint,
  htmlFor,
  label,
}: {
  children: ReactNode;
  className?: string;
  hint?: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint}
    </div>
  );
}

/**
 * Says what went wrong, where a screen reader will reach it.
 *
 * `className` is an escape for a surface the destructive red does not read on.
 * Nothing needs it today — the sign-in gate that did is a light card now — but
 * it costs one prop and the alternative is a second component.
 */
export function FormError({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-step--1 text-destructive", className)} role="alert">
      {children}
    </p>
  );
}

/**
 * One count above a board: an icon, a label, a number. Moved up from the
 * Housekeeping board when Maintenance became its second caller (ADR 0013).
 */
export function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
        <span className="text-xs font-medium tracking-wider uppercase">
          {label}
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}
