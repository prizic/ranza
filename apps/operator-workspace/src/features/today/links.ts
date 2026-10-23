import { localizeHref, type SupportedLocale } from "@ranza/i18n";

/**
 * Where each figure opens: the list that explains it, at the same Property
 * (TD-S1-22). Every link carries `?property=`, so following one never moves
 * the viewer to another Property.
 */
export function todayHref(
  locale: SupportedLocale,
  segment:
    | "arrivals"
    | "close-day"
    | "departures"
    | "housekeeping"
    | "maintenance"
    | "finance"
    | "rooms"
    | "reservations"
    | "room-calendar"
    | "audit-log"
    | "close-day",
  propertyId: string,
  extra?: Record<string, string>,
): string {
  const query = new URLSearchParams({ property: propertyId, ...extra });
  return `${localizeHref(locale, segment)}?${query.toString()}`;
}
