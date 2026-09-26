"use client";

import { useEffect, useState } from "react";
import { formatTime, type SupportedLocale } from "@ranza/i18n";

/**
 * Wall-clock time at the Property.
 *
 * It ticks because a frozen clock is worse than no clock — it reads as current
 * and is not. The server renders the first value so the line never arrives
 * empty; the hydration warning is suppressed for the one element whose whole
 * job is to differ from the moment the page was built.
 */
export function LocalClock({
  initial,
  locale,
  timeZone,
}: {
  initial: string;
  locale: SupportedLocale;
  timeZone: string;
}) {
  const [time, setTime] = useState(initial);

  useEffect(() => {
    const tick = () => setTime(formatTime(new Date(), locale, timeZone));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [locale, timeZone]);

  return <time suppressHydrationWarning>{time}</time>;
}
