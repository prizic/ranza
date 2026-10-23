"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Says so when a table has more to show sideways than its box does.
 *
 * A table that scrolls without saying so is a row cut off at the window's edge
 * and nothing to suggest there is more of it. This puts a fade at each edge
 * the row can still travel towards, and records the same on the frame as
 * `data-cue-start` and `data-cue-end` — for a pinned column to draw its own
 * (see `PINNED_END` in data-table.tsx) and for a test to read.
 *
 * It looks for the table's scroller by its slot, so it wraps `<Table>` and
 * nothing else. `scrollLeft` counts from the start edge in both directions —
 * zero there, and negative towards the end on a right-to-left page — so its
 * magnitude is how far the row has travelled either way.
 */
export function ScrollCue({
  children,
  className,
  pinnedEnd = false,
}: {
  children: ReactNode;
  className?: string | undefined;
  /** The table pins a column to its end, which draws the end cue itself. */
  pinnedEnd?: boolean | undefined;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [cue, setCue] = useState({ start: false, end: false });

  useEffect(() => {
    const scroller = frame.current?.querySelector<HTMLElement>(
      '[data-slot="table-container"]',
    );
    if (!scroller) return;

    const measure = () => {
      const hidden = scroller.scrollWidth - scroller.clientWidth;
      const travelled = Math.abs(scroller.scrollLeft);
      const next = { start: travelled > 1, end: hidden - travelled > 1 };
      setCue((current) =>
        current.start === next.start && current.end === next.end
          ? current
          : next,
      );
    };

    measure();
    scroller.addEventListener("scroll", measure, { passive: true });
    // Every browser has one; a test environment may not, and then the cue is
    // read once on mount and on scrolling, which is all it can know.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(scroller);
    if (scroller.firstElementChild) {
      observer?.observe(scroller.firstElementChild);
    }
    return () => {
      scroller.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      className={cn("group/scroll relative", className)}
      data-cue-end={cue.end}
      data-cue-start={cue.start}
      ref={frame}
    >
      {cue.start ? <Fade edge="start" /> : null}
      {cue.end && !pinnedEnd ? <Fade edge="end" /> : null}
      {children}
    </div>
  );
}

function Fade({ edge }: { edge: "start" | "end" }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-y-0 z-20 w-8 from-background to-transparent",
        edge === "start"
          ? "start-0 bg-linear-to-r rtl:bg-linear-to-l"
          : "end-0 bg-linear-to-l rtl:bg-linear-to-r",
      )}
    />
  );
}
