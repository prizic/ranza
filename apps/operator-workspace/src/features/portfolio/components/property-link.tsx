"use client";

import type { ReactNode } from "react";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { rememberProperty } from "../../../lib/property-choice";

/**
 * A link that makes `propertyId` the Property being worked in and goes to one
 * of its screens — a figure on a card, taken to the list behind it.
 *
 * It does what `OpenProperty` does, so the two cannot disagree about where the
 * viewer is working: the choice is remembered on this device (OA-S3-05) and the
 * destination is a full load, because ADR 0019 drops the client cache on a
 * Property switch and a new document does that by construction. A screen that
 * is switched off at that Property turns the viewer away itself; nothing here
 * decides that.
 */
export function PropertyLink({
  children,
  className,
  label,
  locale,
  propertyId,
  query = "",
  segment,
}: {
  children: ReactNode;
  className?: string;
  /** The link's accessible name, which says which figure at which Property. */
  label: string;
  locale: SupportedLocale;
  propertyId: string;
  /** More of the query: `show=owing`. */
  query?: string;
  /** The screen, as the rail names its route: `finance`, `arrivals`. */
  segment: string;
}) {
  const search = `property=${encodeURIComponent(propertyId)}${query ? `&${query}` : ""}`;
  return (
    <a
      aria-label={label}
      className={className}
      href={`${localizeHref(locale, segment)}?${search}`}
      onClick={() => rememberProperty(propertyId)}
    >
      {children}
    </a>
  );
}
