"use client";

import { useTranslations } from "next-intl";
import { formatTime, type SupportedLocale } from "@ranza/i18n";

/**
 * How fresh a polled list is, and the moment it stops being trustworthy.
 *
 * A list that refreshes itself every half minute shows nothing of that, so a
 * desk cannot tell a quiet list from a stalled one. This says when it was last
 * read, in the Property's own clock, and when the last read failed it says so
 * above the rows that are still there: they are the last good ones, and a
 * signed-out desk's buttons will be refused (ARR-09).
 */
export function ListFreshness({
  error,
  locale,
  timeZone,
  updatedAt,
}: {
  /** The last read's failure, when it failed; the rows on screen are older. */
  error: unknown;
  locale: SupportedLocale;
  timeZone: string;
  /** When the rows were last read, in epoch milliseconds. */
  updatedAt: number;
}) {
  const t = useTranslations();
  const signedOut = (error as { status?: unknown } | null)?.status === 401;

  return (
    <div className="mt-3 grid gap-2">
      {error ? (
        <p
          className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-step--1"
          role="alert"
        >
          {signedOut ? t("refusalSignedOut") : t("listStale")}
        </p>
      ) : null}
      {updatedAt > 0 ? (
        <p
          className="text-step--1 text-muted-foreground tabular-nums"
          data-testid="list-updated-at"
        >
          {t("listUpdatedAt", {
            time: formatTime(updatedAt, locale, timeZone),
          })}
        </p>
      ) : null}
    </div>
  );
}
