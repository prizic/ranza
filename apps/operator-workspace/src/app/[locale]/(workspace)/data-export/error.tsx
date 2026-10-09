"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState } from "@ranza/ui";

/**
 * The data export screen failed to read or to render. A retry in place of a
 * blank workspace, and the error logged rather than swallowed: a list that
 * reads empty when the database is down says nobody exported anything.
 */
export default function DataExportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("dataExport");

  useEffect(() => {
    console.error("data_export.render_failed", {
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
