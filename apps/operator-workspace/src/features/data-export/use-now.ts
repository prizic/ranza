"use client";

import { useEffect, useState } from "react";

/**
 * The time, as of the last tick, and null until the browser has one.
 *
 * Null on the server and in the first client render so that both draw the same
 * thing: a clock read during render is a hydration mismatch the moment the
 * server and the browser disagree by a second.
 */
export function useNow(intervalMs: number): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
