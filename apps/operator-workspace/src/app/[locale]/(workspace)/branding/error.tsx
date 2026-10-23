"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState } from "@ranza/ui";

/**
 * The Branding screen failed to read or to render. A retry in place of a blank
 * workspace, and the error logged rather than swallowed: a brand that reads as
 * the default when the database is down says nobody ever set one.
 */
export default function BrandingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("branding");

  useEffect(() => {
    console.error("branding.render_failed", {
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
