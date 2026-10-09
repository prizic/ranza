"use client";

import { Button } from "@ranza/ui";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { rememberProperty } from "../../../lib/property-choice";

/**
 * Makes `propertyId` the Property being worked in and opens Today there.
 *
 * It does what the page bar's switcher does, so the two cannot disagree about
 * where the viewer is working: the choice is remembered on this device
 * (OA-S3-05) and the destination is a full load, because ADR 0019 drops the
 * client cache on a Property switch and a new document does that by
 * construction. Nothing here authorizes anything; Today checks the Property
 * against what the viewer reaches, and one it does not list falls back to
 * Today's own choice (HK-S1-24).
 */
export function OpenProperty({
  label,
  locale,
  propertyId,
  variant = "outline",
}: {
  label: string;
  locale: SupportedLocale;
  propertyId: string;
  variant?: "default" | "outline";
}) {
  return (
    <Button asChild variant={variant}>
      <a
        href={`${localizeHref(locale, "today")}?property=${encodeURIComponent(propertyId)}`}
        onClick={() => rememberProperty(propertyId)}
      >
        {label}
      </a>
    </Button>
  );
}
