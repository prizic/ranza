import {
  AlarmClock,
  Ban,
  BedDouble,
  CalendarCheck,
  CircleAlert,
  CircleDashed,
  LogOut,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { RoomCalendarBar } from "../../../server/viewer";

/**
 * How each kind of bar looks, in one place so the legend, the grid and the
 * drawer cannot disagree. Colour is never the only signal: every bar carries
 * the icon of its state, and each warning adds its own icon and, where the bar
 * is wide enough to read it, its word (RC-S1-25, RC-S1-59).
 */
export type BarLook =
  "requested" | "confirmed" | "inHouse" | "overdue" | "departed";

export const BAR_LOOK: Record<BarLook, string> = {
  requested:
    "border border-dashed border-primary/60 bg-background text-foreground",
  confirmed: "border border-primary/40 bg-primary/15 text-foreground",
  inHouse: "border border-primary bg-primary text-primary-foreground",
  overdue: "border border-warning bg-warning-soft text-warning",
  departed: "border border-border bg-muted text-muted-foreground",
};

export const BAR_ICON: Record<BarLook, LucideIcon> = {
  requested: CircleDashed,
  confirmed: CalendarCheck,
  inHouse: BedDouble,
  overdue: AlarmClock,
  departed: LogOut,
};

export function barLook(bar: RoomCalendarBar): BarLook {
  if (bar.kind === "reservation") return bar.status;
  if (bar.status === "departed") return "departed";
  return bar.overdue ? "overdue" : "inHouse";
}

export type BarWarning = "overlap" | "bookedWhileBlocked" | "clashes";

export const WARNING_ICON: Record<BarWarning, LucideIcon> = {
  overlap: TriangleAlert,
  bookedWhileBlocked: Ban,
  clashes: CircleAlert,
};

const WARNING_RING: Record<BarWarning, string> = {
  overlap: "ring-2 ring-danger ring-offset-1",
  bookedWhileBlocked: "ring-2 ring-warning ring-offset-1",
  clashes: "ring-1 ring-danger/60",
};

/** Every warning a bar carries, most serious first. */
export function barWarnings(bar: RoomCalendarBar): BarWarning[] {
  const warnings: BarWarning[] = [];
  if (bar.overlaps) warnings.push("overlap");
  if (bar.bookedWhileBlocked) warnings.push("bookedWhileBlocked");
  if (bar.clashesWith) warnings.push("clashes");
  return warnings;
}

/** The ring of the most serious warning, drawn around the bar. */
export function warningRing(warnings: readonly BarWarning[]): string {
  const first = warnings[0];
  return first ? WARNING_RING[first] : "";
}

/** The hatch a blocked or out-of-service night is drawn with. */
export const OUT_OF_USE =
  "bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-border)_6px_8px)]";
