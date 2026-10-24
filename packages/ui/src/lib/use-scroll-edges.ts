"use client";

import { useEffect, useState, type RefObject } from "react";

export interface ScrollEdges {
  /** The list can still travel back towards where it starts. */
  start: boolean;
  /** The list can still travel on towards where it ends. */
  end: boolean;
}

/**
 * Which edges of a scroller have more beyond them, so a list that scrolls can
 * say so (SHELL-01, SHELL-02). A list cut off at the frame's edge with nothing
 * to suggest there is more of it is a destination nobody finds.
 *
 * `scrollLeft` counts from the start edge in both directions — zero there, and
 * negative towards the end on a right-to-left page — so its magnitude is how far
 * the list has travelled either way. `content` is anything that changes when
 * what the list holds does without the scroller changing size, such as a group
 * of the sidebar opening: it makes the edges be read again.
 */
export function useScrollEdges(
  scroller: RefObject<HTMLElement | null>,
  axis: "x" | "y",
  content: string | number = 0,
): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;

    const measure = () => {
      const hidden =
        axis === "x"
          ? element.scrollWidth - element.clientWidth
          : element.scrollHeight - element.clientHeight;
      const travelled = Math.abs(
        axis === "x" ? element.scrollLeft : element.scrollTop,
      );
      const next = { start: travelled > 1, end: hidden - travelled > 1 };
      setEdges((current) =>
        current.start === next.start && current.end === next.end
          ? current
          : next,
      );
    };

    measure();
    element.addEventListener("scroll", measure, { passive: true });
    // Every browser has one; a test environment may not, and then the edges
    // are read on mount, on scrolling and when `content` changes, which is all it
    // can know.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    for (const child of element.children) observer?.observe(child);
    return () => {
      element.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [scroller, axis, content]);

  return edges;
}
