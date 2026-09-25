"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState } from "@ranza/ui";

/**
 * The room calendar failed to render. A retry in place of a blank workspace,
 * and the error logged rather than swallowed (RC-S1-54). Where client errors
 * are sent beyond the console is the workspace's decision, not this screen's
 * (RC-DEF-09).
 */
export default function RoomCalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("roomCalendar");

  useEffect(() => {
    console.error("room_calendar.render_failed", {
      digest: error.digest,
      error,
    });
  }, [error]);

  return (
    <EmptyState
      action={<Button onClick={reset}>{t("retry")}</Button>}
      description={t("failedDescription")}
      title={t("failedTitle")}
    />
  );
}
