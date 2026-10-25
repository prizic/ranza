import type { RoomCalendarBar } from "../../server/viewer";
import { daysBetween } from "./layout";

/**
 * A booking whose arrival date has passed and whose Guest never checked in.
 * `nightsGone` is the booking with every night behind it: nothing holds the
 * room any more and the booking waits for a no-show or a cancellation, which is
 * what Reservations calls "Did not arrive". Otherwise the Guest is late with
 * nights still ahead, and Arrivals can still check them in (CALENDAR-03).
 */
export interface LateArrival {
  /** Whole days since the date they were due. */
  days: number;
  nightsGone: boolean;
}

export function lateArrival(
  bar: RoomCalendarBar,
  today: string,
): LateArrival | null {
  if (bar.kind !== "reservation" || bar.startsOn >= today) return null;
  return {
    days: daysBetween(bar.startsOn, today),
    nightsGone: bar.endsOn !== null && bar.endsOn <= today,
  };
}
