"use client";

import { useTranslations } from "next-intl";
import { RouteError } from "../../route-error";

/**
 * The data export screen failed to read or to render. A list that reads empty
 * when the database is down says nobody exported anything, so it says it failed.
 * Says so in the screen's own words, and tries again by fetching the route
 * afresh, which `reset` alone does not do for a server failure (audit
 * 2026-11-07, D-02).
 */
export default function DataExportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("dataExport");
  return (
    <RouteError
      copy={{
        title: t("failedTitle"),
        description: t("failedDescription"),
        retry: t("retry"),
      }}
      error={error}
      event="data_export.render_failed"
      reset={reset}
    />
  );
}
