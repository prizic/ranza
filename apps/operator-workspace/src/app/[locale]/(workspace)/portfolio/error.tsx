"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState } from "@ranza/ui";

/**
 * All Properties failed to read or render. A retry in place of a blank
 * workspace, and the error logged rather than swallowed; the read has already
 * recorded `portfolio.viewed` with outcome `failed` on the server. Where client
 * errors are sent beyond the console is the workspace's decision, not this
 * screen's.
 */
export default function PortfolioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("portfolio");

  useEffect(() => {
    console.error("portfolio.render_failed", {
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
