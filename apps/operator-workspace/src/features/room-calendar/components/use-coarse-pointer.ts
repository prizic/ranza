import { useSyncExternalStore } from "react";

const COARSE = "(pointer: coarse)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(COARSE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the main way of pointing is a finger. A touch is left to scroll the
 * grid and never drags a bar (RC-S3-13), so a hint to drag is only true for a
 * mouse or a pen. Read after hydration: the server draws the mouse's wording,
 * which is the one a desk's computer reads.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(COARSE).matches,
    () => false,
  );
}
