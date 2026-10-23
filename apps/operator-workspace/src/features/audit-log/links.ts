import { localizeHref, type SupportedLocale } from "@ranza/i18n";

/**
 * Where a record's subject can be opened, when there is somewhere to open it.
 *
 * Only a folio, a room or bed, a Property, an Organization and a data export
 * have a screen that shows one by id. A reservation and a stay are not shown
 * alone anywhere, so for them the log itself is the destination: every record
 * about it, and about the stays and folios that belong with it (AUDIT-02).
 */
export interface SubjectReach {
  /** Which of the screens a subject can open the viewer may open at all. */
  finance: boolean;
  rooms: boolean;
  configuration: boolean;
  dataExport: boolean;
}

export function subjectHref(
  locale: SupportedLocale,
  propertyId: string,
  subjectType: string,
  subjectId: string,
  reach: SubjectReach,
): string | null {
  const here = (segment: string, query: string) =>
    `${localizeHref(locale, segment)}?property=${propertyId}${query}`;
  switch (subjectType) {
    case "folio":
      return reach.finance ? here("finance", `&folio=${subjectId}`) : null;
    case "accommodation_unit":
      return reach.rooms ? here("rooms", `&unit=${subjectId}`) : null;
    case "property":
    case "organization":
      return reach.configuration ? here("configuration", "") : null;
    case "data_export":
      return reach.dataExport ? here("data-export", "") : null;
    default:
      return null;
  }
}

/** The log narrowed to everything about one subject. */
export function historyHref(
  locale: SupportedLocale,
  propertyId: string,
  subjectId: string,
): string {
  return `${localizeHref(locale, "audit-log")}?property=${propertyId}&subject=${subjectId}`;
}
