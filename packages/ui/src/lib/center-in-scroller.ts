/**
 * Brings `item` to the middle of the scroller that holds it, moving that
 * scroller and nothing else (SHELL-02, SHELL-15).
 *
 * `scrollIntoView` would do the same, but it moves every ancestor that scrolls
 * as well — the page included — and a bar that opens at its current item must
 * not take the page's own scroll position with it. The distance is measured
 * between the two boxes on screen, so it is right whichever way the row runs:
 * a positive amount moves the view towards the physical right on either side.
 */
export function centerInScroller(scroller: HTMLElement, item: HTMLElement) {
  // Not every environment lays out or scrolls; the row is then as it opened.
  if (typeof scroller.scrollBy !== "function") return;
  const row = scroller.getBoundingClientRect();
  const box = item.getBoundingClientRect();
  const distance = box.left + box.width / 2 - (row.left + row.width / 2);
  if (Math.abs(distance) < 1) return;
  scroller.scrollBy({ left: distance });
}
