"use client";

import { useTranslations } from "next-intl";
import { RouteError } from "../../route-error";

/**
 * All Properties failed to read or render. The read has already recorded
 * `portfolio.viewed` with outcome `failed` on the server.
 * Says so in the screen's own words, and tries again by fetching the route
 * afresh, which `reset` alone does not do for a server failure (audit
 * 2026-11-07, D-02).
 */
export default function PortfolioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("portfolio");
  return (
    <RouteError
      copy={{
        title: t("failedTitle"),
        description: t("failedDescription"),
        retry: t("retry"),
      }}
      error={error}
      event="portfolio.render_failed"
      reset={reset}
    />
  );
}
