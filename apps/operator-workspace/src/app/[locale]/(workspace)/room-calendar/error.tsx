"use client";

import { useTranslations } from "next-intl";
import { RouteError } from "../../route-error";

/**
 * The room calendar failed to render (RC-S1-54). Where client errors are sent
 * beyond the console is the workspace's decision, not this screen's (RC-DEF-09).
 * Says so in the screen's own words, and tries again by fetching the route
 * afresh, which `reset` alone does not do for a server failure (audit
 * 2026-11-07, D-02).
 */
export default function RoomCalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("roomCalendar");
  return (
    <RouteError
      copy={{
        title: t("failedTitle"),
        description: t("failedDescription"),
        retry: t("retry"),
      }}
      error={error}
      event="room_calendar.render_failed"
      reset={reset}
    />
  );
}
