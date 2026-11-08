"use client";

import { useTranslations } from "next-intl";
import { RouteError } from "../../route-error";

/**
 * The Branding screen failed to read or to render. The brand is never shown as the
 * default on a failed read: a brand that reads as the default when the database
 * is down says nobody ever set one.
 * Says so in the screen's own words, and tries again by fetching the route
 * afresh, which `reset` alone does not do for a server failure (audit
 * 2026-11-07, D-02).
 */
export default function BrandingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("branding");
  return (
    <RouteError
      copy={{
        title: t("failedTitle"),
        description: t("failedDescription"),
        retry: t("retry"),
      }}
      error={error}
      event="branding.render_failed"
      reset={reset}
    />
  );
}
