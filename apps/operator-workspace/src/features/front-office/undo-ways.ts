import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import type { FrontDeskReach } from "./reach";

/** Where a refused withdrawal of a check-in sends the desk (audit 2026-11-07, A-07). */
export interface UndoWays {
  /** The Stay's Folio, where posted charges are corrected; null where not allowed or none. */
  folioHref: string | null;
  /** Departures, where a Guest who is not staying is checked out; null where not allowed. */
  departuresHref: string | null;
}

export function undoWays(
  locale: SupportedLocale,
  propertyId: string,
  reach: FrontDeskReach,
  folioId: string | null,
): UndoWays {
  const property = encodeURIComponent(propertyId);
  return {
    folioHref:
      folioId && reach.folio
        ? `${localizeHref(locale, "finance")}?property=${property}&folio=${encodeURIComponent(folioId)}`
        : null,
    departuresHref: reach.departures
      ? `${localizeHref(locale, "departures")}?property=${property}`
      : null,
  };
}
