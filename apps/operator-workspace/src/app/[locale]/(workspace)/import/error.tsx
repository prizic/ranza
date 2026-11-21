"use client";

import { useTranslations } from "next-intl";
import { RouteError } from "../../route-error";

/**
 * The import screen failed to read or to render. A list that reads empty when
 * the database is down says nobody imported anything, so it says it failed.
 */
export default function ImportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("imports");
  return (
    <RouteError
      copy={{
        title: t("failed.title"),
        description: t("failed.description"),
        retry: t("failed.retry"),
      }}
      error={error}
      event="import.render_failed"
      reset={reset}
    />
  );
}
