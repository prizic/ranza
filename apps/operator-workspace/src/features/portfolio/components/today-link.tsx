"use client";

import { Button } from "@ranza/ui";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";

/** A way to Today when the page has no Property of its own to open. */
export function TodayLink({
  label,
  locale,
}: {
  label: string;
  locale: SupportedLocale;
}) {
  return (
    <Button asChild>
      <a href={localizeHref(locale, "today")}>{label}</a>
    </Button>
  );
}
