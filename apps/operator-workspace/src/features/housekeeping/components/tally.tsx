import { cn } from "@ranza/ui";

/**
 * One count above a list. Small on a phone, where five of the larger tiles
 * once took the whole first screen before the first room (HK-03).
 */
export function Tally({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className={cn("rounded-2xl border bg-card p-3 sm:p-4", className)}>
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums sm:mt-2 sm:text-2xl">
        {value}
      </p>
    </div>
  );
}
