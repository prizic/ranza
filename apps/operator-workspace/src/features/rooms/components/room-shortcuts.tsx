"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarRange } from "lucide-react";
import { cn } from "@ranza/ui";
import type { UnitEntry } from "../../../server/viewer";

/**
 * Where a room that is reserved or has a Guest in it leads without opening
 * its dialog first: the Guest's booking, and the room against its neighbours
 * on the calendar (RB-S2-23). Each is offered only where the viewer may open
 * the screen it leads to, so none ends in a refusal.
 *
 * Both are links beside the control that opens the dialog, never inside it,
 * and render nothing for a room with neither to offer.
 */
export function RoomShortcuts({
  calendarHref,
  className,
  reservationsHref,
  roomName,
  unit,
}: {
  calendarHref: string | null;
  className?: string;
  reservationsHref: string | null;
  /** The room a bed is in; the calendar finds a room by its name. */
  roomName: string;
  unit: UnitEntry;
}) {
  const rp = useTranslations("roomsPage");
  const state = unit.state;
  const stayHref =
    state?.kind === "in_house" && state.reservationId && reservationsHref
      ? `${reservationsHref}&open=${state.reservationId}`
      : null;
  const onCalendarHref =
    calendarHref && (state?.kind === "in_house" || state?.kind === "reserved")
      ? `${calendarHref}&q=${encodeURIComponent(roomName)}`
      : null;

  if (!stayHref && !onCalendarHref) return null;

  const link =
    "inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}
    >
      {stayHref ? (
        <Link className={link} href={stayHref} prefetch={false}>
          {rp("openStay")}
        </Link>
      ) : null}
      {onCalendarHref ? (
        <Link className={link} href={onCalendarHref} prefetch={false}>
          <CalendarRange aria-hidden="true" className="size-3.5" />
          {rp("showOnCalendar")}
        </Link>
      ) : null}
    </div>
  );
}
