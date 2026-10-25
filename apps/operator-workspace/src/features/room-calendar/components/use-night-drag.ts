"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { nightsDragged, type BookingTarget } from "../move";
import { DRAG_THRESHOLD_PX, hitAt } from "./use-bar-drag";

interface Session {
  pointerId: number;
  startX: number;
  startY: number;
  firstDay: string;
  lastDay: string;
  travelled: boolean;
}

/** The day cell a press began on, when it began on one rather than on a bar. */
function dayPressed(event: PointerEvent<HTMLElement>): string | null {
  return event.target instanceof HTMLElement
    ? (event.target.dataset.day ?? null)
    : null;
}

/**
 * Pointer handling for dragging across a row's free nights to book them
 * (RC-S5-02), put on the row so that a press on a bar stays the bar's.
 *
 * Like a bar's drag it only proposes: every move reports the nights to
 * `onPreview`, and the release hands them to `onBook`, which opens New
 * reservation on them. A press that does not travel is a click and asks for
 * nothing. Escape drops it, and a touch screen is left to scroll the grid; the
 * New reservation button is the way in without a mouse.
 */
export function useNightDrag({
  enabled,
  onBook,
  onPreview,
  today,
  unitId,
}: {
  enabled: boolean;
  onBook: (target: BookingTarget & { endsOn: string }) => void;
  onPreview: (target: BookingTarget | null) => void;
  today: string;
  unitId: string;
}) {
  const session = useRef<Session | null>(null);
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

  function finish() {
    session.current = null;
    setDragging(false);
    onPreview(null);
  }

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const day = dayPressed(event);
      if (
        !enabled ||
        day === null ||
        day < today ||
        event.button !== 0 ||
        event.pointerType === "touch"
      ) {
        return;
      }
      // No text is selected across the row while the nights are swept.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      session.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        firstDay: day,
        lastDay: day,
        travelled: false,
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
        setDragging(true);
      }
      // Along its own row: only the day under the pointer is read.
      const { day } = hitAt(event.clientX, event.clientY);
      if (day) current.lastDay = day;
      onPreview(
        nightsDragged(unitId, current.firstDay, current.lastDay, today),
      );
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const current = session.current;
      if (!current || event.pointerId !== current.pointerId) return;
      finish();
      if (current.travelled) {
        onBook(nightsDragged(unitId, current.firstDay, current.lastDay, today));
      }
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      if (session.current?.pointerId === event.pointerId) finish();
    },
  };
}
