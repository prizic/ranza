import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Whether the table inside the element the ref is put on needs more room than
 * the element has, and the ref itself — so a list can swap its columns for a
 * row that stacks, instead of sliding the room, the lateness and the balance
 * out of sight under the pinned action column.
 *
 * Measured by what the table asked for, not by a width chosen in advance: how
 * wide a row has to be depends on the names and rooms in it, and the sidebar
 * takes a third of a laptop screen, so neither the window nor a constant says
 * whether it fits. The width the full row asked for is remembered while it is
 * stacked, which is what says when it fits again.
 *
 * Starts as the full row, which is what the server draws; the first
 * measurement is taken before the browser paints.
 *
 * `watch` is whatever changes what the table holds, so a longer name arriving
 * in a poll is measured too.
 */
export function useOverflowing<T extends HTMLElement>(
  watch: unknown,
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [stacked, setStacked] = useState(false);
  const asked = useRef(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const available = element.getBoundingClientRect().width;
      if (stacked) {
        if (available >= asked.current) setStacked(false);
        return;
      }
      const table = element.querySelector("table");
      const needed = table?.getBoundingClientRect().width ?? 0;
      if (needed > available + 1) {
        asked.current = needed;
        setStacked(true);
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [stacked, watch]);

  return [ref, stacked];
}
