"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { daysBetween, type PlacedEntry } from "../layout";
import { proposeMove, type DragMode, type MoveRequest } from "../move";

/** A press that travels less than this is a click, not a drag. */
export const DRAG_THRESHOLD_PX = 5;

/** How a drop was made: by carrying the bar or pulling its end, and where it let go. */
export interface BarDrop {
  mode: DragMode;
  at: { x: number; y: number };
}

interface Session {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  /** The day under the pointer when it went down; a drag is measured from it. */
  originDay: string | null;
  travelled: boolean;
  unitId: string;
  dayShift: number;
}

/**
 * The row and the day under a point. Read from what the page draws there, so
 * the right-to-left grid and a scrolled one need no arithmetic of their own:
 * a row carries its Unit and a day cell its date.
 */
export function hitAt(
  x: number,
  y: number,
): { unitId: string | null; day: string | null } {
  let unitId: string | null = null;
  let day: string | null = null;
  for (const element of document.elementsFromPoint(x, y)) {
    if (!(element instanceof HTMLElement)) continue;
    day ??= element.dataset.day ?? null;
    unitId ??= element.dataset.unitId ?? null;
  }
  return { unitId, day };
}

/**
 * Pointer handling for dragging a bar on the room calendar (RC-S3-01).
 *
 * A drag only proposes: every move reports the request it would make to
 * `onPreview`, and the release hands it to `onDrop`. Nothing is written here.
 * Escape drops the drag. A touch screen is left to scroll the grid — a finger
 * on a bar is a swipe, so it moves a booking through Move… in the drawer
 * instead (RC-S3-13).
 */
export function useBarDrag({
  enabled,
  entry,
  onDrop,
  onPreview,
}: {
  enabled: boolean;
  entry: PlacedEntry;
  /** `at` is where the pointer let go, for a confirm drawn beside it. */
  onDrop: (request: MoveRequest, drop: BarDrop) => void;
  onPreview: (request: MoveRequest | null) => void;
}) {
  const session = useRef<Session | null>(null);
  const swallowClick = useRef(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      session.current = null;
      setDragging(false);
      onPreview(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [dragging, onPreview]);

  function proposal(current: Session): MoveRequest | null {
    return proposeMove(
      entry,
      current.mode,
      current.dayShift,
      // An end is pulled along its own row.
      current.mode === "resize" ? entry.unit.unitId : current.unitId,
    );
  }

  function finish() {
    session.current = null;
    setDragging(false);
    onPreview(null);
  }

  /** The handlers for one grip: the bar itself moves it, its end resizes it. */
  function grip(mode: DragMode) {
    return {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        swallowClick.current = false;
        if (!enabled || event.button !== 0 || event.pointerType === "touch") {
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        session.current = {
          mode,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originDay: hitAt(event.clientX, event.clientY).day,
          travelled: false,
          unitId: entry.unit.unitId,
          dayShift: 0,
        };
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const current = session.current;
        if (!current || event.pointerId !== current.pointerId) return;
        if (!current.travelled) {
          const travelled = Math.hypot(
            event.clientX - current.startX,
            event.clientY - current.startY,
          );
          if (travelled < DRAG_THRESHOLD_PX) return;
          current.travelled = true;
          swallowClick.current = true;
          setDragging(true);
        }
        const hit = hitAt(event.clientX, event.clientY);
        if (hit.unitId) current.unitId = hit.unitId;
        if (hit.day && current.originDay) {
          current.dayShift = daysBetween(current.originDay, hit.day);
        }
        onPreview(proposal(current));
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        const current = session.current;
        if (!current || event.pointerId !== current.pointerId) return;
        const request = current.travelled ? proposal(current) : null;
        finish();
        if (request) {
          onDrop(request, {
            mode: current.mode,
            at: { x: event.clientX, y: event.clientY },
          });
        }
      },
      onPointerCancel(event: PointerEvent<HTMLElement>) {
        if (session.current?.pointerId === event.pointerId) finish();
      },
    };
  }

  return {
    grip,
    /** True once for the click a finished drag leaves behind, which must not open the drawer. */
    consumeDragClick(): boolean {
      const swallowed = swallowClick.current;
      swallowClick.current = false;
      return swallowed;
    },
  };
}
